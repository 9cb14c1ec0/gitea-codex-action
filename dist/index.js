// src/index.ts
import { readFile } from "fs/promises";

// src/config.ts
import { z } from "zod";
var booleanInput = z.enum(["true", "false"]).transform((value) => value === "true");
var csv = z.string().transform((value) => value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
var schema = z.object({
  openaiApiKey: z.string().min(1, "openai_api_key is required"),
  giteaToken: z.string(),
  model: z.string().min(1),
  reasoningEffort: z.enum(["low", "medium", "high", "xhigh"]),
  triggerPhrase: z.string().min(1),
  assigneeTrigger: z.string(),
  labelTrigger: z.string(),
  allowedActors: csv,
  baseBranch: z.string(),
  branchPrefix: z.string().regex(/^[A-Za-z0-9._/-]+\/$/, "branch_prefix must end in /"),
  customInstructions: z.string(),
  maxTurns: z.coerce.number().int().min(1).max(100),
  timeoutMinutes: z.coerce.number().int().min(1).max(120),
  sandboxMode: z.enum(["read-only", "workspace-write"]),
  allowNetwork: booleanInput,
  gitName: z.string().min(1),
  gitEmail: z.string().email()
});
var input = (name, fallback = "") => process.env[`INPUT_${name}`] ?? fallback;
function loadConfig() {
  return schema.parse({
    openaiApiKey: input("OPENAI_API_KEY"),
    giteaToken: input("GITEA_TOKEN", process.env.GITEA_TOKEN ?? process.env.GITHUB_TOKEN ?? ""),
    model: input("MODEL", "gpt-5.6-terra"),
    reasoningEffort: input("REASONING_EFFORT", "medium"),
    triggerPhrase: input("TRIGGER_PHRASE", "@codex"),
    assigneeTrigger: input("ASSIGNEE_TRIGGER"),
    labelTrigger: input("LABEL_TRIGGER"),
    allowedActors: input("ALLOWED_ACTORS"),
    baseBranch: input("BASE_BRANCH"),
    branchPrefix: input("BRANCH_PREFIX", "codex/"),
    customInstructions: input("CUSTOM_INSTRUCTIONS"),
    maxTurns: input("MAX_TURNS", "25"),
    timeoutMinutes: input("TIMEOUT_MINUTES", "30"),
    sandboxMode: input("SANDBOX_MODE", "workspace-write"),
    allowNetwork: input("ALLOW_NETWORK", "false"),
    gitName: input("GIT_NAME", "Codex"),
    gitEmail: input("GIT_EMAIL", "codex-bot@users.noreply.local")
  });
}

// src/gitea/context.ts
var record = (value) => typeof value === "object" && value !== null ? value : {};
var text = (value) => typeof value === "string" ? value : "";
var number = (value) => typeof value === "number" ? value : 0;
var list = (value) => Array.isArray(value) ? value.map(record) : [];
var login = (value) => {
  const item = record(value);
  return text(item.login) || text(item.username);
};
var bot = (value) => {
  const item = record(value);
  return Boolean(item.is_bot) || /\[bot\]$/i.test(login(item));
};
function normalizeEvent(platform, eventName, payload, deliveryId) {
  const value = record(payload), repo = record(value.repository), owner = record(repo.owner);
  const issueRaw = record(value.issue), prRaw = record(value.pull_request), commentRaw = record(value.comment);
  const source = Object.keys(issueRaw).length ? issueRaw : prRaw;
  const issue = Object.keys(source).length ? {
    number: number(source.number),
    title: text(source.title),
    body: text(source.body),
    author: login(source.user),
    labels: list(source.labels).map((label) => text(label.name)).filter(Boolean),
    assignees: list(source.assignees).map(login).filter(Boolean),
    isPullRequest: Boolean(source.pull_request) || Object.keys(prRaw).length > 0
  } : void 0;
  const pr = Object.keys(prRaw).length ? { number: number(prRaw.number), head: text(record(prRaw.head).ref), base: text(record(prRaw.base).ref), fromFork: Boolean(record(prRaw.head).repo && record(prRaw.base).repo && record(record(prRaw.head).repo).full_name !== record(record(prRaw.base).repo).full_name) } : void 0;
  const comment = Object.keys(commentRaw).length ? { id: number(commentRaw.id), body: text(commentRaw.body), author: login(commentRaw.user), isBot: bot(commentRaw.user) } : void 0;
  const defaultBranch = text(repo.default_branch);
  return {
    platform,
    event: eventName.startsWith("issue_comment") ? "issue_comment" : eventName.startsWith("pull_request") ? "pull_request" : "issues",
    action: text(value.action),
    ...deliveryId ? { deliveryId } : {},
    repository: { owner: text(owner.login) || text(owner.username), name: text(repo.name), ...defaultBranch ? { defaultBranch } : {}, private: Boolean(repo.private) },
    actor: { login: login(value.sender) || login(value.actor), isBot: bot(value.sender) || bot(value.actor) },
    ...issue ? { issue } : {},
    ...comment ? { comment } : {},
    ...pr ? { pullRequest: pr } : {}
  };
}

// src/policy/authorization.ts
function authorize(context, config) {
  if (context.actor.isBot) return { allowed: false, reason: "bot actor" };
  if (config.allowedActors.length && !config.allowedActors.includes(context.actor.login.toLowerCase())) return { allowed: false, reason: "actor is not allowlisted" };
  return { allowed: true, reason: "authorized" };
}

// src/prompt/sanitizer.ts
var secret = /(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|(?:sk|gitea)_[A-Za-z0-9_-]{16,}|Authorization:\s*Bearer\s+\S+)/gi;
function redactSecrets(value) {
  return value.replace(secret, "[REDACTED]");
}

// src/result.ts
import { appendFileSync } from "fs";
function writeOutputs(result) {
  const output = process.env.GITHUB_OUTPUT;
  const values = { triggered: String(result.triggered), conclusion: result.conclusion, comment_id: String(result.commentId ?? ""), branch: result.branch ?? "", pull_request_number: String(result.pullRequestNumber ?? ""), input_tokens: String(result.inputTokens), output_tokens: String(result.outputTokens), estimated_cost_usd: result.estimatedCostUsd === void 0 ? "" : String(result.estimatedCostUsd) };
  if (output) appendFileSync(output, Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n") + "\n");
  else for (const [key, value] of Object.entries(values)) process.stdout.write(`::set-output name=${key}::${value}
`);
}

// src/trigger/matcher.ts
function matchTrigger(context, config) {
  if (context.actor.isBot || context.comment?.isBot) return { triggered: false, reason: "bot-authored event" };
  const body = context.comment?.body ?? context.issue?.body ?? "";
  if (body.toLocaleLowerCase().includes(config.triggerPhrase.toLocaleLowerCase())) return { triggered: true, reason: "mention matched" };
  if (config.assigneeTrigger && context.issue?.assignees.some((item) => item.toLowerCase() === config.assigneeTrigger.toLowerCase())) return { triggered: true, reason: "assignee matched" };
  if (config.labelTrigger && context.issue?.labels.some((item) => item.toLowerCase() === config.labelTrigger.toLowerCase())) return { triggered: true, reason: "label matched" };
  return { triggered: false, reason: "no trigger matched" };
}

// src/index.ts
function log(message) {
  process.stdout.write(`${redactSecrets(message)}
`);
}
async function main() {
  const config = loadConfig();
  const eventPath = process.env.GITHUB_EVENT_PATH ?? process.env.GITEA_EVENT_PATH;
  const eventName = process.env.GITHUB_EVENT_NAME ?? process.env.GITEA_EVENT_NAME;
  if (!eventPath || !eventName) throw new Error("event path and event name are required");
  const payload = JSON.parse(await readFile(eventPath, "utf8"));
  const platform = process.env.GITHUB_ACTIONS === "true" ? "github" : "gitea";
  const context = normalizeEvent(platform, eventName, payload, process.env.GITHUB_DELIVERY);
  const trigger = matchTrigger(context, config), auth = authorize(context, config);
  if (!trigger.triggered || !auth.allowed) {
    log(`Skipped: ${!trigger.triggered ? trigger.reason : auth.reason}`);
    writeOutputs({ triggered: false, conclusion: "skipped", inputTokens: 0, outputTokens: 0 });
    return;
  }
  log("Request authorized; sandbox-agent orchestration is not yet configured.");
  writeOutputs({ triggered: true, conclusion: "failure", inputTokens: 0, outputTokens: 0 });
}
main().catch((error) => {
  log(error instanceof Error ? error.message : "unknown error");
  writeOutputs({ triggered: false, conclusion: "failure", inputTokens: 0, outputTokens: 0 });
  process.exitCode = 1;
});
