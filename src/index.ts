import { readFile } from "node:fs/promises";
import { runReadOnlyAgent } from "./agent/runner.js";
import { loadConfig } from "./config.js";
import { normalizeEvent } from "./gitea/context.js";
import { ForgeClient, resolveApiBase } from "./gitea/client.js";
import { dataFromContext, fetchData } from "./gitea/data.js";
import { authorize } from "./policy/authorization.js";
import { buildPrompt } from "./prompt/builder.js";
import { redactSecrets } from "./prompt/sanitizer.js";
import { writeOutputs } from "./result.js";
import { renderProgress } from "./tools/progress.js";
import { matchTrigger } from "./trigger/matcher.js";

function log(message: string): void { process.stdout.write(`${redactSecrets(message)}\n`); }

function jobUrl(): string | undefined {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  return GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}` : undefined;
}

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
  const { owner, name } = context.repository;
  const number = context.pullRequest?.number ?? context.issue?.number;
  const isPullRequest = Boolean(context.issue?.isPullRequest ?? context.pullRequest);
  const client = config.giteaToken && config.forgeUrl && number ? new ForgeClient(resolveApiBase(config.forgeUrl), config.giteaToken) : undefined;
  const job = jobUrl();

  let commentId: number | undefined;
  if (client && number) {
    const comment = await client.createIssueComment(owner, name, number, renderProgress({ status: "working", tasks: [], ...(job ? { jobUrl: job } : {}) }));
    commentId = comment.id;
  }
  const data = client && number ? await fetchData(client, owner, name, number, isPullRequest) : dataFromContext(context);
  const prompt = buildPrompt(context, data, config);

  try {
    const result = await runReadOnlyAgent(config, prompt, workspace);
    const summary = redactSecrets(result.answer);
    if (client && number && commentId !== undefined) await client.updateIssueComment(owner, name, commentId, renderProgress({ status: "completed", tasks: [], summary, ...(job ? { jobUrl: job } : {}) }));
    else log(summary);
    writeOutputs({ triggered: true, conclusion: "success", ...(commentId === undefined ? {} : { commentId }), inputTokens: result.inputTokens, outputTokens: result.outputTokens });
  } catch (error) {
    const message = redactSecrets(error instanceof Error ? error.message : "Agent run failed");
    if (client && number && commentId !== undefined) await client.updateIssueComment(owner, name, commentId, renderProgress({ status: "failed", tasks: [], summary: message, ...(job ? { jobUrl: job } : {}) }));
    throw error;
  }
}

main().catch((error: unknown) => { log(error instanceof Error ? error.message : "unknown error"); writeOutputs({ triggered: false, conclusion: "failure", inputTokens: 0, outputTokens: 0 }); process.exitCode = 1; });
