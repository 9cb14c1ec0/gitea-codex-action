import type { Config } from "../config.js";
import type { NormalizedContext } from "../gitea/types.js";

export type TriggerDecision = { triggered: boolean; reason: string };

export const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-phrase, case-insensitive match so `@codex` does not fire inside `@codexbot`. */
export function mentions(text: string, phrases: string[]): boolean {
  if (!text) return false;
  return phrases.some((phrase) => phrase && new RegExp(`(^|\\s)${escapeRegExp(phrase)}([\\s.,!?;:]|$)`, "i").test(text));
}

export function matchTrigger(context: NormalizedContext, config: Config): TriggerDecision {
  if (context.actor.isBot || context.comment?.isBot) return { triggered: false, reason: "bot-authored event" };
  const { triggerPhrases, assigneeTrigger, labelTrigger } = config;

  // A comment (or PR review) is the request itself; the issue body is only a trigger when the entity is new.
  if (context.comment) {
    if (mentions(context.comment.body, triggerPhrases)) return { triggered: true, reason: "mention matched" };
  } else if (context.issue && (context.event === "pull_request" || context.action === "opened")) {
    if (mentions(context.issue.body, triggerPhrases) || mentions(context.issue.title, triggerPhrases)) return { triggered: true, reason: "mention matched" };
  }

  if (assigneeTrigger && context.event === "issues" && (context.action === "assigned" || context.action === "opened")) {
    const wanted = assigneeTrigger.replace(/^@/, "").toLowerCase();
    if (context.issue?.assignees.some((item) => item.toLowerCase() === wanted)) return { triggered: true, reason: "assignee matched" };
  }

  if (labelTrigger && context.event === "issues" && context.action === "labeled") {
    if (context.issue?.labels.some((item) => item.toLowerCase() === labelTrigger.trim().toLowerCase())) return { triggered: true, reason: "label matched" };
  }

  return { triggered: false, reason: "no trigger matched" };
}
