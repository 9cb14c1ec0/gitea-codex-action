import { describe, expect, it } from "vitest";
import { matchTrigger, mentions } from "../../src/trigger/matcher.js";
import type { Config } from "../../src/config.js";
import type { NormalizedContext } from "../../src/gitea/types.js";

const config: Config = { openaiApiKey: "key", giteaToken: "", forgeUrl: "", model: "gpt", reasoningEffort: "medium", triggerPhrases: ["@codex"], triggerPhrase: "@codex", assigneeTrigger: "", labelTrigger: "", allowedActors: [], baseBranch: "", branchPrefix: "codex/", customInstructions: "", maxTurns: 25, timeoutMinutes: 30, sandboxMode: "workspace-write", allowNetwork: false, gitName: "Codex", gitEmail: "bot@example.com" };
const context: NormalizedContext = { platform: "gitea", event: "issue_comment", action: "created", repository: { owner: "o", name: "r", private: false }, actor: { login: "alice", isBot: false }, comment: { id: 1, body: "Please @CoDeX review", author: "alice", isBot: false } };
const issue = { number: 1, title: "t", body: "b", author: "alice", labels: [] as string[], assignees: [] as string[], isPullRequest: false };
const withoutComment = (overrides: Partial<NormalizedContext>): NormalizedContext => {
  const next: NormalizedContext = { ...context, ...overrides };
  delete next.comment;
  return next;
};

describe("phrase matching", () => {
  it("matches on a word boundary", () => expect(mentions("hey @codex, look", ["@codex"])).toBe(true));
  it("does not match inside a longer handle", () => expect(mentions("ping @codexbot please", ["@codex"])).toBe(false));
  it("matches any configured phrase", () => expect(mentions("ping @CodexCode", ["@codex", "@CodexCode"])).toBe(true));
  it("ignores empty text", () => expect(mentions("", ["@codex"])).toBe(false));
});

describe("trigger matching", () => {
  it("matches mentions without case sensitivity", () => expect(matchTrigger(context, config).triggered).toBe(true));
  it("blocks bot comments", () => expect(matchTrigger({ ...context, comment: { ...context.comment!, isBot: true } }, config).triggered).toBe(false));
  it("blocks bot actors", () => expect(matchTrigger({ ...context, actor: { login: "codex-bot", isBot: true } }, config).triggered).toBe(false));

  it("matches a mention in a newly opened issue", () =>
    expect(matchTrigger(withoutComment({ event: "issues", action: "opened", issue: { ...issue, body: "@codex please look" } }), config).triggered).toBe(true));

  it("ignores a stale body mention on a later issue event", () =>
    expect(matchTrigger(withoutComment({ event: "issues", action: "labeled", issue: { ...issue, body: "@codex please look" } }), config).triggered).toBe(false));

  it("matches the assignee trigger on assignment", () =>
    expect(matchTrigger(withoutComment({ event: "issues", action: "assigned", issue: { ...issue, assignees: ["CodexCode"] } }), { ...config, assigneeTrigger: "@codexcode" }).triggered).toBe(true));

  it("matches the label trigger only on label events", () =>
    expect(matchTrigger(withoutComment({ event: "issues", action: "labeled", issue: { ...issue, labels: ["Codex"] } }), { ...config, labelTrigger: "codex" }).triggered).toBe(true));
});
