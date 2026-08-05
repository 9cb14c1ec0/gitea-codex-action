# gitea-codex-action

A secure composite action for Gitea and GitHub that responds to authorized issue
and pull-request requests with an OpenAI coding agent. API credentials and write
authorization remain in the trusted host process; they are never intended to be
passed into the agent sandbox.

> **Project status:** read-only question and review runs are implemented. Issue
> and pull-request metadata, comments, the changed-file summary, and the unified
> diff are fetched over the forge API and embedded in the prompt as delimited
> untrusted data. The checked-out repository is staged into a Unix-local sandbox
> inside the runner job container; the OpenAI and forge credentials are retained
> by the host process. Branch, commit, push, and pull-request mutation tools are
> not yet implemented.

## Setup

1. Create an OpenAI API key and save it as the repository secret
   `OPENAI_API_KEY`.
2. Create a least-privilege token for the forge, save it as `GITEA_TOKEN` when
   using Gitea, and grant it read access for read-only usage. Future branch/PR
   automation will require repository write access.
3. Add one of the workflow examples below. Pin to a release tag or commit SHA
   once releases are available; do not depend on a mutable branch in production.
4. Mention `@codex` in an issue or pull-request comment. Optionally restrict
   callers with `allowed_actors`.

## GitHub Actions

Create `.github/workflows/codex.yml`:

```yaml
name: Codex

on:
  issue_comment:
    types: [created]
  issues:
    types: [opened, assigned, labeled]
  pull_request:
    types: [opened, synchronize]

permissions:
  contents: write
  issues: write
  pull-requests: write

jobs:
  codex:
    # Never give write permissions to untrusted fork PRs.
    if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.fork == false
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: 9cb14c1ec0/gitea-codex-action@master # Replace with a version tag when released.
        with:
          openai_api_key: ${{ secrets.OPENAI_API_KEY }}
          gitea_token: ${{ secrets.GITHUB_TOKEN }}
          forge_url: ${{ github.api_url }}
          allowed_actors: your-github-login
```

For a question/review-only deployment, use `contents: read`, `issues: write`,
and `pull-requests: write` instead. The supplied `GITHUB_TOKEN` is selected
automatically if `gitea_token` is empty, but passing it explicitly makes the
workflow intent clear.

## Gitea Actions

Create a workflow such as `.gitea/workflows/codex.yml`. The exact event names
and token-secret syntax can vary by Gitea version and runner configuration:

```yaml
name: Codex

on:
  issue_comment:
    types: [created]
  issues:
    types: [opened, assigned, labeled]
  pull_request:
    types: [opened, synchronize]

jobs:
  codex:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: 9cb14c1ec0/gitea-codex-action@master # Replace with a version tag when released.
        with:
          openai_api_key: ${{ secrets.OPENAI_API_KEY }}
          gitea_token: ${{ secrets.GITEA_TOKEN }}
          forge_url: https://git.example.com
          allowed_actors: your-gitea-login
```

Configure `GITEA_EVENT_PATH`, `GITEA_EVENT_NAME`, and the server URL according
to your runner's event contract. The action currently detects GitHub by
`GITHUB_ACTIONS=true`; all other runners are treated as Gitea.

## Configuration

| Input | Default | Description |
| --- | --- | --- |
| `openai_api_key` | required | OpenAI API key. |
| `gitea_token` | runner token | Forge API token; defaults to `GITEA_TOKEN` or `GITHUB_TOKEN`. |
| `forge_url` | runner URL | Gitea server URL or GitHub API URL; required to post tracking comments. |
| `model` | `gpt-5.6-terra` | OpenAI model selected for the run. |
| `reasoning_effort` | `medium` | `low`, `medium`, `high`, or `xhigh`. |
| `trigger_phrase` | `@codex` | Comma- or newline-separated trigger phrases, matched case-insensitively on whole words. |
| `assignee_trigger` / `label_trigger` | empty | Optional assignee or label triggers. |
| `allowed_actors` | empty | Comma-separated actor allowlist; empty permits all non-bot actors. |
| `custom_instructions` | empty | Trusted operator instructions appended to the agent's system prompt. |
| `branch_prefix` | `codex/` | Required prefix for generated work branches. |
| `max_turns` / `timeout_minutes` | `25` / `30` | Reserved limits for agent execution. |
| `sandbox_mode` | `workspace-write` | Reserved sandbox policy. |
| `allow_network` | `false` | Reserved sandbox network policy. |

Never place keys in workflow files, repository variables, prompts, or issue
comments. Use secrets, keep `allowed_actors` populated, and give the token only
the scopes required by the workflow.

## Development

```sh
npm ci
npm run check
npm run build
```
