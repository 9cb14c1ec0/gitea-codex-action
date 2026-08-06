import { describe, expect, it } from "vitest";
import { ForgeClient } from "../../src/gitea/client.js";
import { fetchData, formatChangedFiles, formatComments, formatContext, MAX_COMMENTS } from "../../src/gitea/data.js";
import type { Config } from "../../src/config.js";
import type { NormalizedContext } from "../../src/gitea/types.js";
import { buildPrompt } from "../../src/prompt/builder.js";

const config: Config = { openaiApiKey: "key", giteaToken: "t", forgeUrl: "https://git.example.com/", model: "gpt", reasoningEffort: "medium", triggerPhrases: ["@codex"], triggerPhrase: "@codex", assigneeTrigger: "", labelTrigger: "", allowedActors: [], baseBranch: "", branchPrefix: "codex/", customInstructions: "", maxTurns: 25, timeoutMinutes: 30, sandboxMode: "workspace-write", allowNetwork: false, gitName: "Codex", gitEmail: "bot@example.com" };

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const routed = (routes: Array<[RegExp, () => Response]>) => (async (url: string | URL | Request) => {
  const target = String(url);
  const hit = routes.find(([pattern]) => pattern.test(target));
  return hit ? hit[1]() : new Response("not found", { status: 404 });
}) as unknown as typeof fetch;

describe("context fetching", () => {
  it("ignores a non-diff body served with a 200", async () => {
    const client = new ForgeClient("https://git.example.com/api/v1/", "t", routed([
      [/\/pulls\/7/, () => json({ title: "T", state: "open", user: { login: "alice" } })]
    ]));
    expect((await fetchData(client, "o", "r", 7, true)).diff).toBe("");
  });

  it("gathers pull request metadata, comments, files and diff", async () => {
    const client = new ForgeClient("https://git.example.com/api/v1/", "t", routed([
      [/\/pulls\/7\.diff$/, () => new Response("diff --git a/x b/x\n--- a/x\n+++ b/x\n", { status: 200 })],
      [/\/pulls\/7\/files/, () => json([{ filename: "src/x.ts", status: "modified", additions: 3, deletions: 1 }])],
      [/\/pulls\/7$/, () => json({ title: "Fix x", body: "does things", state: "open", user: { login: "alice" }, base: { ref: "master" }, head: { ref: "fix" }, additions: 3, deletions: 1 })],
      [/\/issues\/7\/comments/, () => json([{ body: "first", user: { login: "bob" }, created_at: "2026-01-01" }])]
    ]));
    const data = await fetchData(client, "o", "r", 7, true);
    expect(data.entity.title).toBe("Fix x");
    expect(data.entity.headRef).toBe("fix");
    expect(data.changedFiles).toHaveLength(1);
    expect(data.comments[0]?.author).toBe("bob");
    expect(data.diff).toContain("+++ b/x");
  });

  it("degrades to partial context when optional endpoints fail", async () => {
    const client = new ForgeClient("https://git.example.com/api/v1/", "t", routed([
      [/\/pulls\/7$/, () => json({ title: "Fix x", state: "open", user: { login: "alice" } })]
    ]));
    const data = await fetchData(client, "o", "r", 7, true);
    expect(data.entity.title).toBe("Fix x");
    expect(data.changedFiles).toEqual([]);
    expect(data.diff).toBe("");
  });

  it("keeps only the most recent comments and reports the omission", async () => {
    const many = Array.from({ length: MAX_COMMENTS + 5 }, (_, i) => ({ body: `c${i}`, user: { login: "bob" }, created_at: "2026-01-01" }));
    const client = new ForgeClient("https://git.example.com/api/v1/", "t", routed([
      [/\/issues\/7$/, () => json({ title: "T", state: "open", user: { login: "alice" } })],
      [/\/issues\/7\/comments/, () => json(many)]
    ]));
    const data = await fetchData(client, "o", "r", 7, false);
    expect(data.comments).toHaveLength(MAX_COMMENTS);
    expect(data.omittedComments).toBe(5);
    expect(formatComments(data.comments, data.omittedComments)).toContain("5 earlier comment(s) omitted");
  });

  it("redacts secrets in the diff", async () => {
    const client = new ForgeClient("https://git.example.com/api/v1/", "t", routed([
      [/\/pulls\/7\.diff$/, () => new Response("diff --git a/x b/x\n@@ -1 +1 @@\n+const t = 'ghp_abcdefghijklmnopqrstuvwxyz012345'\n", { status: 200 })],
      [/\/pulls\/7$/, () => json({ title: "T", state: "open", user: { login: "alice" } })]
    ]));
    const data = await fetchData(client, "o", "r", 7, true);
    expect(data.diff).toContain("[REDACTED]");
    expect(data.diff).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz");
  });
});

describe("formatting", () => {
  it("summarises a pull request", () => expect(formatContext({ title: "T", body: "", author: "a", state: "OPEN", headRef: "fix", baseRef: "master", additions: 2, deletions: 1 }, true)).toContain("fix -> master"));
  it("summarises an issue", () => expect(formatContext({ title: "T", body: "", author: "a", state: "OPEN" }, false)).toContain("Issue title: T"));
  it("reports an empty changed-file list", () => expect(formatChangedFiles([])).toBe("No files changed"));
  it("reports an empty comment list", () => expect(formatComments([])).toBe("No comments"));
});

describe("prompt building", () => {
  const prContext: NormalizedContext = {
    platform: "gitea", event: "issue_comment", action: "created",
    repository: { owner: "o", name: "r", private: false }, actor: { login: "alice", isBot: false },
    issue: { number: 7, title: "Fix x", body: "body", author: "alice", labels: [], assignees: [], isPullRequest: true },
    comment: { id: 1, body: "@codex review this", author: "alice", isBot: false },
    pullRequest: { number: 7, head: "fix", base: "master", fromFork: false }
  };
  const data = { entity: { title: "Fix x", body: "body", author: "alice", state: "OPEN", headRef: "fix", baseRef: "master", additions: 3, deletions: 1 }, comments: [], omittedComments: 0, changedFiles: [{ path: "src/x.ts", changeType: "modified", additions: 3, deletions: 1 }], diff: "--- a/x\n+++ b/x\n" };

  it("includes the diff and changed files for a pull request", () => {
    const prompt = buildPrompt(prContext, data, config);
    expect(prompt).toContain("<untrusted-diff>");
    expect(prompt).toContain("src/x.ts");
    expect(prompt).toContain("<untrusted-trigger-comment>");
  });

  it("tells the model to review rather than summarise", () => expect(buildPrompt(prContext, data, config)).toContain("Do not merely summarise or list the commits"));

  it("omits pull-request-only blocks for an issue", () => {
    const issueContext: NormalizedContext = { ...prContext, issue: { ...prContext.issue!, isPullRequest: false } };
    delete issueContext.pullRequest;
    const prompt = buildPrompt(issueContext, { ...data, changedFiles: [], diff: "" }, config);
    expect(prompt).not.toContain("<untrusted-diff>");
    expect(prompt).not.toContain("<untrusted-changed-files>");
  });

  it("states the read-only limit", () => expect(buildPrompt(prContext, data, config)).toContain("read-only access"));
});
