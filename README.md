# gitea-codex-action

An in-progress secure composite action for Gitea and GitHub that routes authorized
issue and pull-request requests to an OpenAI coding agent. It intentionally keeps
API credentials and write authorization in the host process.

## Development

```sh
npm ci
npm run check
npm run build
```

The initial implementation provides the trusted boundary: input validation,
payload normalization, trigger/actor policy, secret-safe logging, API transport,
prompt delimiting, and workspace/branch validation. Sandbox agent execution and
mutation orchestration are added only on top of these guards.
