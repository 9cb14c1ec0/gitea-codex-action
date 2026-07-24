export type Platform = "gitea" | "github";
export type EventKind = "issue_comment" | "issues" | "pull_request";
export type NormalizedContext = {
  platform: Platform; event: EventKind; action: string; deliveryId?: string;
  repository: { owner: string; name: string; defaultBranch?: string; private: boolean };
  actor: { login: string; isBot: boolean };
  issue?: { number: number; title: string; body: string; author: string; labels: string[]; assignees: string[]; isPullRequest: boolean };
  comment?: { id: number; body: string; author: string; isBot: boolean };
  pullRequest?: { number: number; head: string; base: string; fromFork: boolean };
};
