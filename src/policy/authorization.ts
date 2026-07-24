import type { Config } from "../config.js";
import type { NormalizedContext } from "../gitea/types.js";

export function authorize(context: NormalizedContext, config: Config): { allowed: boolean; reason: string } {
  if (context.actor.isBot) return { allowed: false, reason: "bot actor" };
  if (config.allowedActors.length && !config.allowedActors.includes(context.actor.login.toLowerCase())) return { allowed: false, reason: "actor is not allowlisted" };
  return { allowed: true, reason: "authorized" };
}

export function canMutate(context: NormalizedContext, allowForkWrites = false): boolean {
  return !context.pullRequest?.fromFork || allowForkWrites;
}
