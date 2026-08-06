import type { ApiChangedFile, ApiComment, ApiIssue, ApiPullRequest } from "./types.js";

export class ApiError extends Error {
  constructor(readonly status: number, readonly url: string, message: string) { super(message); }
}

const withTrailingSlash = (url: string) => url.endsWith("/") ? url : `${url}/`;
const isUnifiedDiff = (text: string) => /^(diff --git |--- |Index: |@@ )/m.test(text);

/**
 * Derives the REST API root from a forge URL. Gitea servers are given `/api/v1/`;
 * URLs that already point at an API root (`https://api.github.com`, GHE's `/api/v3`,
 * or an explicit `/api/v1`) are left alone. Deliberately shape-based rather than
 * keyed off platform detection, because Gitea's act_runner also sets
 * `GITHUB_ACTIONS=true` and so cannot be distinguished by that env var alone.
 */
export function resolveApiBase(forgeUrl: string): string {
  if (!forgeUrl) throw new Error("forge_url is required to reach the forge API");
  const base = new URL(withTrailingSlash(forgeUrl));
  if (/\/api\/v\d+\/$/.test(base.pathname) || base.hostname === "api.github.com") return base.toString();
  return new URL("api/v1/", base).toString();
}

export class ForgeClient {
  private readonly baseUrl: string;
  constructor(baseUrl: string, private readonly token: string, private readonly fetcher: typeof fetch = fetch) {
    this.baseUrl = withTrailingSlash(baseUrl);
  }

  async request<T>(method: string, pathname: string, body?: unknown): Promise<T> {
    // Relative join: a leading slash would discard the base's path (e.g. `/api/v1`).
    const url = new URL(pathname.replace(/^\/+/, ""), this.baseUrl).toString();
    const options: RequestInit = { method, headers: { Accept: "application/json", Authorization: `token ${this.token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) } };
    if (body !== undefined) options.body = JSON.stringify(body);
    const response = await this.fetcher(url, options);
    if (!response.ok) throw new ApiError(response.status, url, `Forge API request failed: ${response.status}`);
    return await response.json() as T;
  }

  async listAll<T>(pathname: string): Promise<T[]> {
    const items: T[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const separator = pathname.includes("?") ? "&" : "?";
      const batch = await this.request<T[]>("GET", `${pathname}${separator}page=${page}&limit=100&per_page=100`);
      if (!Array.isArray(batch)) throw new Error(`expected a list from ${pathname}`);
      items.push(...batch);
      if (batch.length < 100) return items;
    }
    throw new Error("pagination limit exceeded");
  }

  /** Raw-text GET, for endpoints such as a pull request's unified diff. */
  async requestText(pathname: string, accept: string): Promise<string> {
    const url = new URL(pathname.replace(/^\/+/, ""), this.baseUrl).toString();
    const response = await this.fetcher(url, { method: "GET", headers: { Accept: accept, Authorization: `token ${this.token}` } });
    if (!response.ok) throw new ApiError(response.status, url, `Forge API request failed: ${response.status}`);
    return await response.text();
  }

  private repoPath(owner: string, repo: string): string { return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`; }

  async getIssue(owner: string, repo: string, number: number): Promise<ApiIssue> {
    return await this.request("GET", `${this.repoPath(owner, repo)}/issues/${number}`);
  }

  async getPullRequest(owner: string, repo: string, number: number): Promise<ApiPullRequest> {
    return await this.request("GET", `${this.repoPath(owner, repo)}/pulls/${number}`);
  }

  async listIssueComments(owner: string, repo: string, number: number): Promise<ApiComment[]> {
    return await this.listAll(`${this.repoPath(owner, repo)}/issues/${number}/comments`);
  }

  async listPullRequestFiles(owner: string, repo: string, number: number): Promise<ApiChangedFile[]> {
    return await this.listAll(`${this.repoPath(owner, repo)}/pulls/${number}/files`);
  }

  /**
   * Gitea serves `pulls/N.diff`; GitHub serves the same content via an Accept header.
   * Each response is shape-checked because the forge that does not support a given
   * form answers 200 with the pull request JSON rather than an error.
   */
  async getPullRequestDiff(owner: string, repo: string, number: number): Promise<string> {
    const base = `${this.repoPath(owner, repo)}/pulls/${number}`;
    const attempts = [() => this.requestText(`${base}.diff`, "text/plain"), () => this.requestText(base, "application/vnd.github.diff")];
    for (const attempt of attempts) {
      try {
        const text = await attempt();
        if (isUnifiedDiff(text)) return text;
      } catch { continue; }
    }
    return "";
  }

  async createIssueComment(owner: string, repo: string, number: number, body: string): Promise<{ id: number }> {
    return await this.request("POST", `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${number}/comments`, { body });
  }

  async updateIssueComment(owner: string, repo: string, id: number, body: string): Promise<{ id: number }> {
    return await this.request("PATCH", `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/comments/${id}`, { body });
  }
}
