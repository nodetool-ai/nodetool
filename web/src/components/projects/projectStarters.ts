/**
 * Starters for a new project, and the pure pieces the surface derives from a
 * prompt: the project's name, the first turn its agent reads, and what a run
 * of the same starter has cost before.
 *
 * A starter is a **skill** — the saved instructions a chat turn invokes by
 * writing `/<name>`. The surface therefore restates nothing a skill says: it
 * names one, and the agent loads the body when it reads the slash command, the
 * same way a typed `/name` works in the composer. Skills the user wrote and
 * skills NodeTool ships are both starters; a project can also start with none,
 * and then the prompt is the whole ask.
 */

import type { ProjectDetail } from "./projectStatus";

/** One skill offered as a starter. */
export interface ProjectStarter {
  /** The skill's name, exactly as `/<name>` invokes it. */
  name: string;
  description: string;
  /** True for a skill that ships with NodeTool rather than a user's own row. */
  system: boolean;
}

/**
 * A skill name (`launch-commercial`) read as a label (`Launch commercial`).
 * The raw name still appears next to the description, because that is what the
 * agent is handed and what the user would type themselves.
 */
export const starterLabel = (name: string): string => {
  const words = name.replace(/[-_]+/g, " ").trim();
  return words.length === 0 ? name : words[0].toUpperCase() + words.slice(1);
};

/** How long a name derived from the prompt may run before it is cut short. */
const NAME_LIMIT = 60;

/**
 * The project's name, taken from the prompt's first line. A name is what the
 * tab and the card carry, so it is trimmed to a phrase rather than left as a
 * paragraph; an empty prompt falls back to the starter's label.
 */
export const projectNameFromPrompt = (
  prompt: string,
  starter: ProjectStarter | null
): string => {
  const firstLine = prompt.trim().split("\n")[0]?.trim() ?? "";
  if (firstLine.length === 0) {
    return starter ? starterLabel(starter.name) : "New project";
  }
  if (firstLine.length <= NAME_LIMIT) {
    return firstLine;
  }
  const cut = firstLine.slice(0, NAME_LIMIT);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

interface FirstTurnInput {
  prompt: string;
  /** The picked starter, or null when the prompt stands on its own. */
  starter: ProjectStarter | null;
  /** Entity names picked from the library, injected by name downstream. */
  entityNames: readonly string[];
}

/** True when the prompt already invokes `/name` as a whitespace-delimited word. */
const invokesStarter = (prompt: string, name: string): boolean => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)/${escaped}(\\s|$)`).test(prompt);
};

/**
 * The first thing the project's agent reads: the starter it was given, what
 * the user asked for, and which library entities to season the prompts with.
 *
 * The starter leads on its own line as `/<name>`, which is what the host
 * matches to load the skill's instructions into the turn — a name after
 * whitespace, so the prompt below it is left exactly as written. A prompt that
 * already types that slash command (the composer's `/` menu writes it inline)
 * keeps its own copy rather than getting a second one. Each part is omitted
 * when it says nothing.
 */
export const composeFirstTurn = ({
  prompt,
  starter,
  entityNames
}: FirstTurnInput): string => {
  const parts =
    starter && !invokesStarter(prompt, starter.name)
      ? [`/${starter.name}`]
      : [];
  parts.push(prompt.trim());
  if (entityNames.length > 0) {
    parts.push(`Use these entities: ${entityNames.join(", ")}.`);
  }
  return parts.filter((part) => part.length > 0).join("\n\n");
};

export interface SpendEstimate {
  minUsd: number;
  maxUsd: number;
  /** Projects the range was read off. */
  samples: number;
}

/**
 * Below this, a project's total reads as someone poking at the starter once and
 * moving on rather than a spend a real run of it produced.
 */
const MIN_HISTORICAL_SPEND_USD = 1;

/**
 * What this starter has cost before, read off the user's own past projects of
 * the same kind that plausibly ran to the end. There is no "completed" flag on
 * a project, so completion is inferred: a priced total (no unpriced calls, so
 * the number is not a lower bound), above a spend floor that rules out a
 * project abandoned after one cheap call, *and* a timeline document with at
 * least one clip — the cut a video starter ends on. A starter that produces no
 * cut never has enough signal to qualify, so it never contributes an estimate.
 *
 * Fewer than two projects meeting all of that is no range, and no line: an
 * estimate nothing was measured for would be a number we made up.
 */
export const estimateFromHistory = (
  summaries: readonly ProjectDetail[],
  kind: string
): SpendEstimate | null => {
  if (kind.length === 0) {
    return null;
  }
  const totals = summaries
    .filter(
      (entry) =>
        entry.project.kind === kind &&
        entry.spend.unpricedCount === 0 &&
        entry.spend.totalUsd >= MIN_HISTORICAL_SPEND_USD &&
        entry.documents.some(
          (doc) => doc.status?.kind === "timeline" && doc.status.clips > 0
        )
    )
    .map((entry) => entry.spend.totalUsd);
  if (totals.length < 2) {
    return null;
  }
  return {
    minUsd: Math.min(...totals),
    maxUsd: Math.max(...totals),
    samples: totals.length
  };
};

/** `est. $3.10–$5.80 · provider rates, no markup` */
export const formatEstimate = (estimate: SpendEstimate): string =>
  `est. $${estimate.minUsd.toFixed(2)}–$${estimate.maxUsd.toFixed(2)} · ` +
  `from ${estimate.samples} past projects · provider rates, no markup`;
