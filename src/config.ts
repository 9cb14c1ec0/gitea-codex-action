import { z } from "zod";

const booleanInput = z.enum(["true", "false"]).transform((value) => value === "true");
const csv = z.string().transform((value) => value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));

const schema = z.object({
  openaiApiKey: z.string().min(1, "openai_api_key is required"),
  giteaToken: z.string(), model: z.string().min(1),
  reasoningEffort: z.enum(["low", "medium", "high", "xhigh"]),
  triggerPhrase: z.string().min(1), assigneeTrigger: z.string(), labelTrigger: z.string(),
  allowedActors: csv, baseBranch: z.string(), branchPrefix: z.string().regex(/^[A-Za-z0-9._/-]+\/$/, "branch_prefix must end in /"),
  customInstructions: z.string(), maxTurns: z.coerce.number().int().min(1).max(100),
  timeoutMinutes: z.coerce.number().int().min(1).max(120),
  sandboxMode: z.enum(["read-only", "workspace-write"]), allowNetwork: booleanInput,
  gitName: z.string().min(1), gitEmail: z.string().email()
});

export type Config = z.output<typeof schema>;
const input = (name: string, fallback = "") => process.env[`INPUT_${name}`] ?? fallback;

export function loadConfig(): Config {
  return schema.parse({
    openaiApiKey: input("OPENAI_API_KEY"), giteaToken: input("GITEA_TOKEN", process.env.GITEA_TOKEN ?? process.env.GITHUB_TOKEN ?? ""),
    model: input("MODEL", "gpt-5.6-terra"), reasoningEffort: input("REASONING_EFFORT", "medium"),
    triggerPhrase: input("TRIGGER_PHRASE", "@codex"), assigneeTrigger: input("ASSIGNEE_TRIGGER"), labelTrigger: input("LABEL_TRIGGER"),
    allowedActors: input("ALLOWED_ACTORS"), baseBranch: input("BASE_BRANCH"), branchPrefix: input("BRANCH_PREFIX", "codex/"),
    customInstructions: input("CUSTOM_INSTRUCTIONS"), maxTurns: input("MAX_TURNS", "25"), timeoutMinutes: input("TIMEOUT_MINUTES", "30"),
    sandboxMode: input("SANDBOX_MODE", "workspace-write"), allowNetwork: input("ALLOW_NETWORK", "false"),
    gitName: input("GIT_NAME", "Codex"), gitEmail: input("GIT_EMAIL", "codex-bot@users.noreply.local")
  });
}
