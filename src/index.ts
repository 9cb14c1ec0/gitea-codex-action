import { readFile } from "node:fs/promises";
import { loadConfig } from "./config.js";
import { normalizeEvent } from "./gitea/context.js";
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
  // Agent orchestration is deliberately only permitted after all trusted checks above.
  // Its sandbox must receive a credential-free environment and host tools must validate mutations.
  log("Request authorized; sandbox-agent orchestration is not yet configured.");
  writeOutputs({ triggered: true, conclusion: "failure", inputTokens: 0, outputTokens: 0 });
}
main().catch((error: unknown) => { log(error instanceof Error ? error.message : "unknown error"); writeOutputs({ triggered: false, conclusion: "failure", inputTokens: 0, outputTokens: 0 }); process.exitCode = 1; });
