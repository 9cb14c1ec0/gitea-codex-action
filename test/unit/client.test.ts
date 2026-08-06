import { describe, expect, it, vi } from "vitest";
import { ForgeClient, resolveApiBase } from "../../src/gitea/client.js";

describe("api base resolution", () => {
  it("appends the Gitea API root", () => expect(resolveApiBase("https://git.example.com/")).toBe("https://git.example.com/api/v1/"));
  it("appends the Gitea API root without a trailing slash", () => expect(resolveApiBase("https://git.example.com")).toBe("https://git.example.com/api/v1/"));
  it("leaves an explicit Gitea API root alone", () => expect(resolveApiBase("https://git.example.com/api/v1")).toBe("https://git.example.com/api/v1/"));
  it("leaves the GitHub API host alone", () => expect(resolveApiBase("https://api.github.com")).toBe("https://api.github.com/"));
  it("leaves the GitHub Enterprise API root alone", () => expect(resolveApiBase("https://ghe.example.com/api/v3")).toBe("https://ghe.example.com/api/v3/"));
  it("rejects an empty forge url", () => expect(() => resolveApiBase("")).toThrow("forge_url is required"));
});

describe("request url building", () => {
  const capture = () => {
    const seen: string[] = [];
    const fetcher = vi.fn(async (url: string | URL | Request) => { seen.push(String(url)); return new Response("{\"id\":1}", { status: 200 }); });
    return { seen, fetcher: fetcher as unknown as typeof fetch };
  };

  it("preserves the api path prefix", async () => {
    const { seen, fetcher } = capture();
    await new ForgeClient("https://git.example.com/api/v1/", "t", fetcher).createIssueComment("o", "r", 7, "hi");
    expect(seen[0]).toBe("https://git.example.com/api/v1/repos/o/r/issues/7/comments");
  });

  it("works against a base with no path", async () => {
    const { seen, fetcher } = capture();
    await new ForgeClient("https://api.github.com", "t", fetcher).createIssueComment("o", "r", 7, "hi");
    expect(seen[0]).toBe("https://api.github.com/repos/o/r/issues/7/comments");
  });
});
