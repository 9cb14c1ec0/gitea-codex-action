import path from "node:path";
import { Runner, setDefaultOpenAIKey } from "@openai/agents";
import { SandboxAgent, Manifest, localDir } from "@openai/agents/sandbox";
import { UnixLocalSandboxClient } from "@openai/agents/sandbox/local";
import type { Config } from "../config.js";
import { buildInstructions } from "./instructions.js";

export type AgentRun = { answer: string; inputTokens: number; outputTokens: number };

export async function runReadOnlyAgent(config: Config, prompt: string, workspace: string): Promise<AgentRun> {
  // The SDK otherwise falls back to process.env.OPENAI_API_KEY, which the action never sets.
  setDefaultOpenAIKey(config.openaiApiKey);
  const manifest = new Manifest({ entries: { repo: localDir({ src: path.resolve(workspace) }) } });
  const agent = new SandboxAgent({
    name: "Repository assistant", model: config.model,
    modelSettings: { reasoning: { effort: config.reasoningEffort } },
    defaultManifest: manifest,
    instructions: buildInstructions(config)
  });
  const timeout = AbortSignal.timeout(config.timeoutMinutes * 60_000);
  const runner = new Runner({ tracingDisabled: true, traceIncludeSensitiveData: false, workflowName: "gitea-codex-action" });
  const result = await runner.run(agent, prompt, {
    maxTurns: config.maxTurns, signal: timeout,
    sandbox: { client: new UnixLocalSandboxClient() }
  });
  return { answer: String(result.finalOutput ?? "No response was generated."), inputTokens: result.state.usage.inputTokens, outputTokens: result.state.usage.outputTokens };
}
