import type { NormalizedContext, Platform } from "./types.js";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => typeof value === "object" && value !== null ? value as RecordValue : {};
const text = (value: unknown): string => typeof value === "string" ? value : "";
const number = (value: unknown): number => typeof value === "number" ? value : 0;
const list = (value: unknown): RecordValue[] => Array.isArray(value) ? value.map(record) : [];
const login = (value: unknown) => { const item = record(value); return text(item.login) || text(item.username); };
const bot = (value: unknown) => { const item = record(value); return Boolean(item.is_bot) || /\[bot\]$/i.test(login(item)); };

export function normalizeEvent(platform: Platform, eventName: string, payload: unknown, deliveryId?: string): NormalizedContext {
  const value = record(payload), repo = record(value.repository), owner = record(repo.owner);
  const issueRaw = record(value.issue), prRaw = record(value.pull_request), commentRaw = record(value.comment);
  const source = Object.keys(issueRaw).length ? issueRaw : prRaw;
  const issue = Object.keys(source).length ? {
    number: number(source.number), title: text(source.title), body: text(source.body), author: login(source.user),
    labels: list(source.labels).map((label) => text(label.name)).filter(Boolean), assignees: list(source.assignees).map(login).filter(Boolean),
    isPullRequest: Boolean(source.pull_request) || Object.keys(prRaw).length > 0
  } : undefined;
  const pr = Object.keys(prRaw).length ? { number: number(prRaw.number), head: text(record(prRaw.head).ref), base: text(record(prRaw.base).ref), fromFork: Boolean(record(prRaw.head).repo && record(prRaw.base).repo && record(record(prRaw.head).repo).full_name !== record(record(prRaw.base).repo).full_name) } : undefined;
  const comment = Object.keys(commentRaw).length ? { id: number(commentRaw.id), body: text(commentRaw.body), author: login(commentRaw.user), isBot: bot(commentRaw.user) } : undefined;
  const defaultBranch = text(repo.default_branch);
  return { platform, event: eventName.startsWith("issue_comment") ? "issue_comment" : eventName.startsWith("pull_request") ? "pull_request" : "issues", action: text(value.action), ...(deliveryId ? { deliveryId } : {}),
    repository: { owner: text(owner.login) || text(owner.username), name: text(repo.name), ...(defaultBranch ? { defaultBranch } : {}), private: Boolean(repo.private) },
    actor: { login: login(value.sender) || login(value.actor), isBot: bot(value.sender) || bot(value.actor) }, ...(issue ? { issue } : {}), ...(comment ? { comment } : {}), ...(pr ? { pullRequest: pr } : {}) };
}
