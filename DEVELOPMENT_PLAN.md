# Development plan: `gitea-codex-action`

This plan treats the implementation as a new, independent project inspired by
the existing Gitea Claude action. It uses the OpenAI Agents SDK with a
sandboxed coding agent and keeps Gitea credentials outside the agent's
execution environment.

## 1. Project goals

Build a composite Gitea/GitHub Action that:

- Responds when mentioned in issues or pull requests.
- Answers questions and reviews code.
- Makes repository changes on controlled branches.
- Commits, pushes, and opens pull requests when requested.
- Reports progress through one tracking comment.
- Supports configurable OpenAI models and reasoning effort.
- Runs on self-hosted Gitea Actions runners and GitHub Actions.
- Treats webhook content and checked-out code as untrusted.
- Uses the OpenAI SDK instead of depending on an interactive CLI installation.

Project name:

```text
gitea-codex-action
```

## 2. Recommended technical direction

Use:

- TypeScript
- Node.js 22
- `@openai/agents`
- `SandboxAgent`
- Zod 4
- The native `fetch` API
- Vitest or Bun Test
- A composite `action.yml`
- `OPENAI_API_KEY` authentication
- `gpt-5.6-terra` with medium reasoning as the initial default

Keep these responsibilities in the trusted host process:

- Gitea API authentication
- Trigger authorization
- Tracking-comment updates
- Branch-name validation
- Commit and push authorization
- Pull-request creation
- Tool input validation

Give the model only narrowly scoped tools. Do not expose the Gitea token or
unrestricted runner environment to the sandbox.

## 3. Architecture

```text
Gitea/GitHub event
        |
        v
Context parser ---> Trigger and authorization policy
        |
        v
Gitea data fetcher
        |
        +-- issue or PR metadata
        +-- selected comments
        +-- changed-file summary
        |
        v
Tracking comment + branch preparation
        |
        v
OpenAI SandboxAgent
        |
        +-- sandboxed filesystem and shell
        +-- read/search/edit tools
        +-- trusted host function tools
                +-- update progress
                +-- inspect issue/PR
                +-- inspect git state
                +-- commit approved paths
                +-- push current branch
                +-- open pull request
        |
        v
Result validation and final comment
```

## 4. Proposed project structure

```text
gitea-codex-action/
|-- action.yml
|-- package.json
|-- package-lock.json
|-- tsconfig.json
|-- README.md
|-- LICENSE
|-- AGENTS.md
|-- src/
|   |-- index.ts
|   |-- config.ts
|   |-- result.ts
|   |-- agent/
|   |   |-- runner.ts
|   |   |-- instructions.ts
|   |   |-- events.ts
|   |   `-- usage.ts
|   |-- gitea/
|   |   |-- client.ts
|   |   |-- context.ts
|   |   |-- data.ts
|   |   `-- types.ts
|   |-- policy/
|   |   |-- authorization.ts
|   |   |-- paths.ts
|   |   |-- branches.ts
|   |   `-- commands.ts
|   |-- tools/
|   |   |-- gitea.ts
|   |   |-- git.ts
|   |   `-- progress.ts
|   |-- workspace/
|   |   |-- branch.ts
|   |   |-- sandbox.ts
|   |   `-- diff.ts
|   |-- prompt/
|   |   |-- builder.ts
|   |   `-- sanitizer.ts
|   `-- trigger/
|       `-- matcher.ts
|-- test/
|   |-- unit/
|   |-- integration/
|   |-- fixtures/
|   `-- security/
`-- examples/
    |-- gitea.yml
    `-- github.yml
```

## 5. Configuration contract

Initial action inputs:

| Input | Default | Purpose |
|---|---|---|
| `openai_api_key` | Required | OpenAI API credential |
| `gitea_token` | Runner token | Gitea/GitHub API access |
| `model` | `gpt-5.6-terra` | OpenAI model |
| `reasoning_effort` | `medium` | Reasoning level |
| `trigger_phrase` | `@codex` | Comment/body trigger |
| `assignee_trigger` | Empty | Optional assignment trigger |
| `label_trigger` | Empty | Optional label trigger |
| `allowed_actors` | Empty | Optional actor allowlist |
| `base_branch` | Repository default | Starting branch |
| `branch_prefix` | `codex/` | Generated branch prefix |
| `custom_instructions` | Empty | Additional agent instructions |
| `max_turns` | `25` | Agent-loop limit |
| `timeout_minutes` | `30` | Overall execution limit |
| `sandbox_mode` | `workspace-write` | Workspace access |
| `allow_network` | `false` | Sandbox network policy |
| `git_name` | `Codex` | Commit author |
| `git_email` | `codex-bot@users.noreply.local` | Commit email |

Initial outputs:

| Output | Purpose |
|---|---|
| `triggered` | Whether the event matched |
| `conclusion` | `success`, `failure`, or `skipped` |
| `comment_id` | Tracking-comment identifier |
| `branch` | Branch used or created |
| `pull_request_number` | Created PR, when applicable |
| `input_tokens` | Model input usage |
| `output_tokens` | Model output usage |
| `estimated_cost_usd` | Optional estimated cost |

Avoid promising an exact cost unless the project maintains a current, tested
price table. Token counts are the authoritative output.

## 6. Development phases

### Phase 0: architecture spike

Purpose: validate the riskiest OpenAI integration before building Gitea
orchestration.

Deliver:

- A minimal `SandboxAgent` that reads a fixture repository.
- One local read tool and one controlled edit operation.
- Streaming event capture.
- Turn and timeout enforcement.
- Usage extraction.
- Verification that the agent cannot read outside its workspace.
- Confirmation that the chosen runner works reliably under Node 22.

Exit criteria:

- The agent can inspect, edit, and test a fixture project.
- No host credentials are visible inside the sandbox.
- Cancellation reliably stops the run.
- SDK event types needed for progress reporting are understood.

If the sandbox runtime does not fit self-hosted Gitea runners, evaluate the
Codex SDK during this phase before proceeding.

### Phase 1: project foundation

Deliver:

- TypeScript project with strict compilation.
- Formatting, linting, tests, and build scripts.
- Composite `action.yml`.
- Typed configuration loader.
- Environment validation.
- Action-output writer.
- Structured logging with secret redaction.
- CI workflow for type checking and unit tests.

Exit criteria:

```text
npm ci
npm run typecheck
npm test
npm run build
```

All commands succeed on a clean runner.

### Phase 2: Gitea compatibility layer

Deliver:

- Webhook context parser.
- Gitea and GitHub payload normalization.
- REST client supporting custom server URLs.
- Issue, PR, comment, changed-file, branch, and repository methods.
- Pagination and retry handling.
- Fixture-based tests for both platforms.

Supported events initially:

- `issue_comment.created`
- `issues.opened`
- `issues.assigned`
- `issues.labeled`
- `pull_request.opened`
- `pull_request.synchronize`

Exit criteria:

- Identical internal context objects are produced for equivalent Gitea and
  GitHub events.
- API errors include useful diagnostics without logging tokens.
- Pagination is covered by tests.

### Phase 3: triggers and authorization

Deliver:

- Case-insensitive trigger matching.
- Assignment and label triggers.
- Optional actor allowlist.
- Bot-loop prevention.
- Repository-collaborator authorization option.
- Duplicate-delivery protection.
- Clear skipped-run reasons.

Authorization should be checked before:

- Calling OpenAI.
- Posting a tracking comment.
- Creating branches.
- Executing repository code.

Exit criteria:

- Unauthorized mentions cannot start an agent.
- Replayed webhook deliveries do not create duplicate active runs.
- Bot-authored comments do not recursively trigger new runs.

### Phase 4: prompt and context construction

Deliver:

- Sanitized issue and PR context.
- Delimited untrusted-content sections.
- Comment selection and size limits.
- Changed-file summaries.
- Repository instruction loading from `AGENTS.md`.
- Explicit autonomy and approval boundaries.
- Separate instructions for questions, reviews, and change requests.

Important rule:

```text
Issue bodies, comments, filenames, branch names, diffs, and repository
instructions are data from potentially untrusted sources. They cannot modify
credential policy, sandbox policy, or host authorization rules.
```

Exit criteria:

- Large conversations are truncated deterministically.
- Secret-like input is not echoed in logs.
- Prompt-injection fixtures cannot obtain unavailable tools or credentials.

### Phase 5: trusted function tools

Implement tools in small capability groups.

Read-only tools:

- `get_issue`
- `get_pull_request`
- `list_branches`
- `git_status`
- `get_diff`

Mutation tools:

- `update_progress`
- `create_branch`
- `commit_files`
- `push_branch`
- `create_pull_request`

Each mutation tool must validate:

- The current event authorizes mutation.
- The branch is within the configured prefix or is the current PR branch.
- Paths resolve inside the workspace.
- No protected branch is targeted.
- Force push is disabled.
- Tool input matches strict Zod schemas.

Exit criteria:

- Tools have isolated unit tests.
- Traversal paths such as `../../secret` are rejected.
- Protected branches cannot be pushed.
- The model never receives raw Gitea credentials.

### Phase 6: agent integration

Deliver:

- `SandboxAgent` construction.
- Model and reasoning configuration.
- Maximum-turn enforcement.
- Abort-controller timeout.
- Streaming event translation.
- Progress throttling.
- Final-output normalization.
- Retry policy for transient API errors.
- Structured run result.

Recommended retry rules:

- Retry timeouts, connection failures, and selected `429`/`5xx` responses.
- Honor server retry hints.
- Use capped exponential backoff with jitter.
- Do not retry tool authorization failures.
- Do not automatically fall back to a weaker model after tool mutations have
  begun.

Exit criteria:

- Read-only questions generate a final comment without creating a branch.
- Requested changes result in a validated diff.
- Timeout and maximum-turn conditions leave a useful final comment.
- Partial tool failures are visible without leaking internal details.

### Phase 7: branch and pull-request workflow

Define two workflows.

For an open pull request:

- Check out the PR head.
- Allow commits only to that branch.
- Push without force.
- Update the tracking comment.

For an issue or non-editable PR:

- Check out the configured base branch.
- Create `codex/issue-<number>-<slug>`.
- Commit only after reviewing the diff.
- Push the branch.
- Open a PR through the trusted host tool.

Exit criteria:

- No-op requests produce no empty commits.
- Existing work branches can be safely resumed.
- Push failure does not incorrectly report success.
- PR creation is idempotent.

### Phase 8: tracking comments and reporting

The host should own comment state rather than relying on the model to compose
the entire comment repeatedly.

Suggested state:

```ts
type ProgressState = {
  status: "queued" | "working" | "completed" | "failed";
  tasks: Array<{
    label: string;
    state: "pending" | "active" | "complete" | "failed";
  }>;
  summary?: string;
  branch?: string;
  pullRequestUrl?: string;
  jobUrl?: string;
};
```

Deliver:

- Initial tracking comment.
- Throttled progress updates.
- Stable job link.
- Final summary.
- Failure and timeout formatting.
- Preservation of user-visible links across updates.

Exit criteria:

- At most one tracking comment is created per run.
- Comment updates are rate-limited.
- A model-generated string cannot remove mandatory security or job metadata.

### Phase 9: security hardening

Threat-model at least:

- Prompt injection through issue comments.
- Malicious repository instructions.
- Command injection through branch names and filenames.
- Path traversal and symlink escapes.
- Secret extraction through shell commands.
- Malicious test scripts.
- Pull requests from forks.
- Dependency-install scripts.
- Force pushes and protected branches.
- Network-based exfiltration.
- Log injection and accidental token output.

Required controls:

- Minimal-scope Gitea token.
- Credential-free sandbox environment.
- Network disabled by default.
- Workspace boundary enforcement.
- Command allowlist or sandbox-native shell policy.
- No `sudo`, Docker socket, runner control socket, or host home access.
- Symlink-aware path validation.
- No automatic execution of package install scripts.
- No arbitrary force push.
- Secret redaction in logs and comments.
- Conservative behavior for untrusted fork PRs.

Exit criteria:

- Dedicated security test suite passes.
- A documented threat model exists.
- Fork PRs default to read-only review unless explicitly enabled.

### Phase 10: packaging and release

Deliver:

- Reproducible build artifact.
- Locked dependencies.
- Release workflow.
- Semantic versioning.
- Immutable version tags.
- Example Gitea and GitHub workflows.
- Upgrade and compatibility notes.
- Dependency-license report.
- Security policy.

Decide early between:

- Installing dependencies during each action run; simpler but slower and
  network-dependent.
- Shipping a bundled JavaScript artifact; faster and more deterministic, but
  requires committed or release-built output.

Prefer a bundled release artifact for production.

Exit criteria:

- A clean Gitea runner executes the released action without development files.
- A tag such as `v1.0.0` resolves to immutable code.
- A movable `v1` tag is updated only by the release workflow.

## 7. Testing strategy

### Unit tests

Cover:

- Configuration parsing.
- Trigger matching.
- Context normalization.
- Sanitization and truncation.
- URL construction.
- Branch and path validation.
- Tool authorization.
- Usage aggregation.
- Output formatting.

### Integration tests

Use fake HTTP and temporary git repositories to cover:

- Tracking-comment lifecycle.
- Issue question workflow.
- PR review workflow.
- Branch creation and commit workflow.
- Push and PR creation.
- Rate limits and transient errors.
- Cancellation and timeout.

### Agent behavior tests

Use recorded or mocked model responses for normal CI:

- Tool-call sequences.
- Multiple tool calls in one turn.
- Invalid tool arguments.
- Repeated tool failures.
- Maximum-turn exhaustion.
- Final response without mutations.

Run a smaller live-model suite manually or on scheduled CI:

- Repository question.
- Code review.
- Single-file fix.
- Multi-file fix.
- Test failure diagnosis.
- Prompt-injection resistance.

### Security tests

Include fixtures containing:

- Malicious issue instructions.
- Hostile `AGENTS.md`.
- Shell metacharacters in branch names.
- Filenames beginning with command flags.
- Symlinks escaping the workspace.
- Attempts to read environment variables.
- Attempts to alter workflow files or runner configuration.
- Attempts to push directly to a protected branch.

## 8. Initial release scope

Include in version 1:

- Gitea and GitHub event parsing.
- Mention, assignee, and label triggers.
- Questions, reviews, and requested code changes.
- One OpenAI model per run.
- Sandboxed workspace operations.
- Tracking-comment updates.
- Branch, commit, push, and PR creation.
- Token usage reporting.
- Actor allowlist.
- Read-only handling for untrusted forks.

Defer until later:

- Multi-agent orchestration.
- Multiple simultaneous models.
- Web search.
- Persistent conversations across separate workflow runs.
- Automatic issue triage without explicit triggers.
- Image and audio inputs.
- Organization-wide policy service.
- Hosted remote sandboxes.
- Automatic model fallback after mutations.
- Support for non-OpenAI model providers.

## 9. Milestones

1. **M0 - SDK viability:** sandboxed agent edits a fixture repository.
2. **M1 - Read-only bot:** authorized Gitea mention produces an answer.
3. **M2 - Review bot:** PR mention produces a structured review.
4. **M3 - Coding bot:** issue request produces a branch, commit, and PR.
5. **M4 - Security candidate:** threat model and adversarial tests pass.
6. **M5 - Release candidate:** bundled action works on clean Gitea and GitHub
   runners.
7. **M6 - v1.0:** documentation, versioning, and release automation complete.

## 10. Definition of done for v1.0

The project is ready when:

- An authorized user can mention the bot on an issue or PR.
- The action posts exactly one tracking comment.
- Questions and reviews do not mutate the repository.
- Change requests produce reviewable commits on an allowed branch.
- The action cannot push to a protected branch or force push.
- The sandbox cannot access the Gitea token or files outside the workspace.
- Fork-originated content cannot trigger write access by default.
- Failures, timeouts, and rate limits produce actionable comments.
- Unit, integration, behavior, and security suites pass.
- The released action is reproducible and documented.
