export class ApiError extends Error {
  constructor(readonly status: number, readonly url: string, message: string) { super(message); }
}

export class ForgeClient {
  constructor(private readonly baseUrl: string, private readonly token: string, private readonly fetcher: typeof fetch = fetch) {}

  async request<T>(method: string, pathname: string, body?: unknown): Promise<T> {
    const url = new URL(pathname, this.baseUrl).toString();
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
      items.push(...batch);
      if (batch.length < 100) return items;
    }
    throw new Error("pagination limit exceeded");
  }

  async createIssueComment(owner: string, repo: string, number: number, body: string): Promise<{ id: number }> {
    return await this.request("POST", `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${number}/comments`, { body });
  }

  async updateIssueComment(owner: string, repo: string, id: number, body: string): Promise<{ id: number }> {
    return await this.request("PATCH", `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/comments/${id}`, { body });
  }
}
