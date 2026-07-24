import type { Config } from "../config.js";
import type { NormalizedContext } from "../gitea/types.js";

export type TriggerDecision = { triggered: boolean; reason: string };
export function matchTrigger(context: NormalizedContext, config: Config): TriggerDecision {
  if (context.actor.isBot || context.comment?.isBot) return { triggered: false, reason: "bot-authored event" };
  const body = context.comment?.body ?? context.issue?.body ?? "";
  if (body.toLocaleLowerCase().includes(config.triggerPhrase.toLocaleLowerCase())) return { triggered: true, reason: "mention matched" };
  if (config.assigneeTrigger && context.issue?.assignees.some((item) => item.toLowerCase() === config.assigneeTrigger.toLowerCase())) return { triggered: true, reason: "assignee matched" };
  if (config.labelTrigger && context.issue?.labels.some((item) => item.toLowerCase() === config.labelTrigger.toLowerCase())) return { triggered: true, reason: "label matched" };
  return { triggered: false, reason: "no trigger matched" };
}
