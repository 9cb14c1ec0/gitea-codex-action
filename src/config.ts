import { z } from "zod";

const booleanInput = z.enum(["true", "false"]).transform((value) => value === "true");
const csv = z.string().transform((value) => value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
/** Comma- or newline-separated, case preserved: trigger phrases are matched case-insensitively but displayed verbatim. */
const list = z.string().transform((value) => value.split(/[,\n\r]+/).map((item) => item.trim()).filter(Boolean));

const schema = z.object({
  openaiApiKey: z.string().min(1, "openai_api_key is required"),
  giteaToken: z.string(), forgeUrl: z.string(), model: z.string().min(1),
  reasoningEffort: z.enum(["low", "medium", "high", "xhigh"]),
  triggerPhrases: list.refine((value) => value.length > 0, "trigger_phrase is required"), assigneeTrigger: z.string(), labelTrigger: z.string(),
  allowedActors: csv, baseBranch: z.string(), branchPrefix: z.string().regex(/^[A-Za-z0-9._/-]+\/$/, "branch_prefix must end in /"),
  customInstructions: z.string(), maxTurns: z.coerce.number().int().min(1).max(100),
  timeoutMinutes: z.coerce.number().int().min(1).max(120),
  sandboxMode: z.enum(["read-only", "workspace-write"]), allowNetwork: booleanInput,
  gitName: z.string().min(1), gitEmail: z.string().email()
});

/** `triggerPhrase` is the first configured phrase, used wherever a single phrase is displayed. */
export type Config = z.output<typeof schema> & { triggerPhrase: string };
const input = (name: string, fallback = "") => process.env[`INPUT_${name}`] ?? fallback;

export function loadConfig(): Config {
  const parsed = schema.parse({
    openaiApiKey: input("OPENAI_API_KEY"), giteaToken: input("GITEA_TOKEN", process.env.GITEA_TOKEN ?? process.env.GITHUB_TOKEN ?? ""), forgeUrl: input("FORGE_URL", process.env.GITEA_URL ?? process.env.GITHUB_API_URL ?? ""),
    model: input("MODEL", "gpt-5.6-terra"), reasoningEffort: input("REASONING_EFFORT", "medium"),
    triggerPhrases: input("TRIGGER_PHRASE", "@codex"), assigneeTrigger: input("ASSIGNEE_TRIGGER"), labelTrigger: input("LABEL_TRIGGER"),
    allowedActors: input("ALLOWED_ACTORS"), baseBranch: input("BASE_BRANCH"), branchPrefix: input("BRANCH_PREFIX", "codex/"),
    customInstructions: input("CUSTOM_INSTRUCTIONS"), maxTurns: input("MAX_TURNS", "25"), timeoutMinutes: input("TIMEOUT_MINUTES", "30"),
    sandboxMode: input("SANDBOX_MODE", "workspace-write"), allowNetwork: input("ALLOW_NETWORK", "false"),
    gitName: input("GIT_NAME", "Codex"), gitEmail: input("GIT_EMAIL", "codex-bot@users.noreply.local")
  });
  return { ...parsed, triggerPhrase: parsed.triggerPhrases[0] ?? "@codex" };
}
