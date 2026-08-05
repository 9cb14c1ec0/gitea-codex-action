import type { ForgeClient } from "./client.js";
import type { ApiUser } from "./types.js";
import { redactSecrets, truncate } from "../prompt/sanitizer.js";

export const MAX_COMMENTS = 30;
export const MAX_DIFF_CHARS = 40_000;

export type EntitySummary = { title: string; body: string; author: string; state: string; baseRef?: string; headRef?: string; additions?: number; deletions?: number };
export type CommentSummary = { author: string; body: string; createdAt: string };
export type ChangedFile = { path: string; changeType: string; additions: number; deletions: number };
export type FetchedData = { entity: EntitySummary; comments: CommentSummary[]; omittedComments: number; changedFiles: ChangedFile[]; diff: string };

const login = (user: ApiUser | undefined) => user?.login ?? user?.username ?? "unknown";
// Context is best-effort: an older forge missing an endpoint degrades the prompt rather than failing the run.
const optional = async <T>(work: () => Promise<T>, fallback: T, label: string): Promise<T> => {
  try { return await work(); } catch (error) { process.stdout.write(`Could not fetch ${label}: ${redactSecrets(error instanceof Error ? error.message : "unknown error")}\n`); return fallback; }
};

export async function fetchData(client: ForgeClient, owner: string, repo: string, number: number, isPullRequest: boolean): Promise<FetchedData> {
  const entity = isPullRequest
    ? await client.getPullRequest(owner, repo, number).then((pr) => ({ title: pr.title ?? "", body: pr.body ?? "", author: login(pr.user), state: (pr.state ?? "").toUpperCase(), baseRef: pr.base?.ref ?? "", headRef: pr.head?.ref ?? "", additions: pr.additions ?? 0, deletions: pr.deletions ?? 0 }))
    : await client.getIssue(owner, repo, number).then((issue) => ({ title: issue.title ?? "", body: issue.body ?? "", author: login(issue.user), state: (issue.state ?? "").toUpperCase() }));

  const allComments = await optional(async () => (await client.listIssueComments(owner, repo, number)).map((item) => ({ author: login(item.user), body: item.body ?? "", createdAt: item.created_at ?? "" })), [] as CommentSummary[], "comments");
  const comments = allComments.slice(-MAX_COMMENTS);
  const changedFiles = isPullRequest
    ? await optional(async () => (await client.listPullRequestFiles(owner, repo, number)).map((file) => ({ path: file.filename ?? "", changeType: file.status ?? "modified", additions: file.additions ?? 0, deletions: file.deletions ?? 0 })), [] as ChangedFile[], "changed files")
    : [];
  const diff = isPullRequest ? await optional(() => client.getPullRequestDiff(owner, repo, number), "", "diff") : "";

  return { entity, comments, omittedComments: allComments.length - comments.length, changedFiles, diff: truncate(redactSecrets(diff), MAX_DIFF_CHARS) };
}

/** Fallback when no API token is configured: everything the webhook payload already gave us. */
export function dataFromContext(context: { issue?: { title: string; body: string; author: string }; pullRequest?: { head: string; base: string } }): FetchedData {
  return {
    entity: { title: context.issue?.title ?? "", body: context.issue?.body ?? "", author: context.issue?.author ?? "unknown", state: "OPEN", ...(context.pullRequest ? { headRef: context.pullRequest.head, baseRef: context.pullRequest.base } : {}) },
    comments: [], omittedComments: 0, changedFiles: [], diff: ""
  };
}

export function formatContext(entity: EntitySummary, isPullRequest: boolean): string {
  if (!isPullRequest) return [`Issue title: ${entity.title}`, `Issue author: ${entity.author}`, `Issue state: ${entity.state}`].join("\n");
  return [`PR title: ${entity.title}`, `PR author: ${entity.author}`, `PR branch: ${entity.headRef} -> ${entity.baseRef}`, `PR state: ${entity.state}`, `PR additions: ${entity.additions}`, `PR deletions: ${entity.deletions}`].join("\n");
}

export function formatComments(comments: CommentSummary[], omitted = 0): string {
  if (!comments.length) return "No comments";
  const header = omitted > 0 ? [`[${omitted} earlier comment(s) omitted]`] : [];
  return [...header, ...comments.map((item) => `[${item.author} at ${item.createdAt}]: ${item.body}`)].join("\n\n");
}

export function formatChangedFiles(files: ChangedFile[]): string {
  if (!files.length) return "No files changed";
  return files.map((file) => `- ${file.path} (${file.changeType}) +${file.additions}/-${file.deletions}`).join("\n");
}
