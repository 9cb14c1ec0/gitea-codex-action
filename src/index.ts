import { readFile } from "node:fs/promises";
import { runReadOnlyAgent } from "./agent/runner.js";
import { loadConfig } from "./config.js";
import { normalizeEvent } from "./gitea/context.js";
import { ForgeClient, resolveApiBase } from "./gitea/client.js";
import { authorize } from "./policy/authorization.js";
import { redactSecrets } from "./prompt/sanitizer.js";
import { writeOutputs } from "./result.js";
import { matchTrigger } from "./trigger/matcher.js";

function log(message: string): void { process.stdout.write(`${redactSecrets(message)}\n`); }
async function main(): Promise<void> {
  const config = loadConfig();
  const eventPath = process.env.GITHUB_EVENT_PATH ?? process.env.GITEA_EVENT_PATH;
  const eventName = process.env.GITHUB_EVENT_NAME ?? process.env.GITEA_EVENT_NAME;
  if (!eventPath || !eventName) throw new Error("event path and event name are required");
  const payload = JSON.parse(await readFile(eventPath, "utf8")) as unknown;
  const platform = process.env.GITHUB_ACTIONS === "true" ? "github" : "gitea";
  const context = normalizeEvent(platform, eventName, payload, process.env.GITHUB_DELIVERY);
  const trigger = matchTrigger(context, config), auth = authorize(context, config);
  if (!trigger.triggered || !auth.allowed) {
    log(`Skipped: ${!trigger.triggered ? trigger.reason : auth.reason}`);
    writeOutputs({ triggered: false, conclusion: "skipped", inputTokens: 0, outputTokens: 0 });
    return;
  }
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
  const apiBase = resolveApiBase(config.forgeUrl);
  const client = config.giteaToken && context.issue ? new ForgeClient(apiBase, config.giteaToken) : undefined;
  let commentId: number | undefined;
  if (client && context.issue) {
    const comment = await client.createIssueComment(context.repository.owner, context.repository.name, context.issue.number, "## Codex\n\nStatus: **working**");
    commentId = comment.id;
  }
  try {
    const result = await runReadOnlyAgent(config, context, workspace);
    if (client && context.issue && commentId !== undefined) await client.updateIssueComment(context.repository.owner, context.repository.name, commentId, `## Codex\n\nStatus: **completed**\n\n${redactSecrets(result.answer)}`);
    else log(result.answer);
    writeOutputs({ triggered: true, conclusion: "success", ...(commentId === undefined ? {} : { commentId }), inputTokens: result.inputTokens, outputTokens: result.outputTokens });
  } catch (error) {
    const message = redactSecrets(error instanceof Error ? error.message : "Agent run failed");
    if (client && context.issue && commentId !== undefined) await client.updateIssueComment(context.repository.owner, context.repository.name, commentId, `## Codex\n\nStatus: **failed**\n\n${message}`);
    throw error;
  }
}
main().catch((error: unknown) => { log(error instanceof Error ? error.message : "unknown error"); writeOutputs({ triggered: false, conclusion: "failure", inputTokens: 0, outputTokens: 0 }); process.exitCode = 1; });
