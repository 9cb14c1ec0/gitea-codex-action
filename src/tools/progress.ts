export type ProgressState = {
  status: "queued" | "working" | "completed" | "failed";
  tasks: Array<{ label: string; state: "pending" | "active" | "complete" | "failed" }>;
  summary?: string; branch?: string; pullRequestUrl?: string; jobUrl?: string;
};

export function renderProgress(state: ProgressState): string {
  const icon = { pending: "○", active: "◐", complete: "✓", failed: "✗" };
  const lines = ["## Codex", `Status: **${state.status}**`, "", ...state.tasks.map((task) => `${icon[task.state]} ${task.label}`)];
  if (state.summary) lines.push("", state.summary);
  if (state.branch) lines.push("", `Branch: \`${state.branch}\``);
  if (state.pullRequestUrl) lines.push(`Pull request: ${state.pullRequestUrl}`);
  if (state.jobUrl) lines.push(`Job: ${state.jobUrl}`);
  return lines.join("\n");
}
