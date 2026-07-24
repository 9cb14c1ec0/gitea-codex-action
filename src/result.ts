export type RunResult = { triggered: boolean; conclusion: "success" | "failure" | "skipped"; commentId?: number; branch?: string; pullRequestNumber?: number; inputTokens: number; outputTokens: number; estimatedCostUsd?: number };

export function writeOutputs(result: RunResult): void {
  const output = process.env.GITHUB_OUTPUT;
  const values: Record<string, string> = { triggered: String(result.triggered), conclusion: result.conclusion, comment_id: String(result.commentId ?? ""), branch: result.branch ?? "", pull_request_number: String(result.pullRequestNumber ?? ""), input_tokens: String(result.inputTokens), output_tokens: String(result.outputTokens), estimated_cost_usd: result.estimatedCostUsd === undefined ? "" : String(result.estimatedCostUsd) };
  if (output) appendFileSync(output, Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n") + "\n");
  else for (const [key, value] of Object.entries(values)) process.stdout.write(`::set-output name=${key}::${value}\n`);
}
import { appendFileSync } from "node:fs";
