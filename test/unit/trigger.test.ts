import { describe, expect, it } from "vitest";
import { matchTrigger } from "../../src/trigger/matcher.js";
import type { Config } from "../../src/config.js";
import type { NormalizedContext } from "../../src/gitea/types.js";

const config: Config = { openaiApiKey: "key", giteaToken: "", model: "gpt", reasoningEffort: "medium", triggerPhrase: "@codex", assigneeTrigger: "", labelTrigger: "", allowedActors: [], baseBranch: "", branchPrefix: "codex/", customInstructions: "", maxTurns: 25, timeoutMinutes: 30, sandboxMode: "workspace-write", allowNetwork: false, gitName: "Codex", gitEmail: "bot@example.com" };
const context: NormalizedContext = { platform: "gitea", event: "issue_comment", action: "created", repository: { owner: "o", name: "r", private: false }, actor: { login: "alice", isBot: false }, comment: { id: 1, body: "Please @CoDeX review", author: "alice", isBot: false } };
describe("trigger matching", () => {
  it("matches mentions without case sensitivity", () => expect(matchTrigger(context, config).triggered).toBe(true));
  it("blocks bot comments", () => expect(matchTrigger({ ...context, comment: { ...context.comment!, isBot: true } }, config).triggered).toBe(false));
});
