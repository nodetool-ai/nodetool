/**
 * What a project can be started as, and the pure pieces the new-project
 * surface derives from a prompt: the project's name, the first turn its agent
 * reads, and what a run of this shape has cost before.
 *
 * A shape only names documents a project can actually hold (the six types
 * `projectDocumentType` lists), so the chain a shortcut promises is the chain
 * the overview will show.
 */

import type { WorkspaceTabType } from "../../stores/WorkspaceTabsStore";
import type { ProjectDetail } from "./projectStatus";

export interface ProjectShapeStep {
  /** The document type — the chain row draws its glyph and color from it. */
  type: WorkspaceTabType;
  label: string;
}

export interface ProjectShape {
  id: string;
  label: string;
  /** Stored on the project row, and the key its cost history is read by. */
  kind: string;
  /** The documents the shape sets up. Empty for a project that starts bare. */
  chain: readonly ProjectShapeStep[];
  /** Told to the agent as what to build. Empty when the prompt is the whole ask. */
  brief: string;
}

const BOARD: ProjectShapeStep = { type: "storyboard", label: "Board" };
const SCRIPT: ProjectShapeStep = { type: "script", label: "Script" };
const CUT: ProjectShapeStep = { type: "timeline", label: "Cut" };

export const PROJECT_SHAPES: readonly ProjectShape[] = [
  {
    id: "spot",
    label: "30s spot",
    kind: "spot",
    chain: [BOARD, SCRIPT, CUT],
    brief:
      "Set this up as a 30-second spot: a storyboard of shots, a voiceover " +
      "script for them, and a cut assembled from the rendered clips."
  },
  {
    id: "trailer",
    label: "Trailer",
    kind: "trailer",
    chain: [BOARD, SCRIPT, CUT],
    brief:
      "Set this up as a trailer: a storyboard of shots, a voiceover script, " +
      "and a cut assembled from the rendered clips."
  },
  {
    id: "music-video",
    label: "Music video",
    kind: "music video",
    chain: [BOARD, CUT],
    brief:
      "Set this up as a music video: a storyboard of shots and a cut " +
      "assembled from the rendered clips, with no spoken script."
  },
  {
    id: "app",
    label: "Mini app",
    kind: "app",
    chain: [{ type: "application", label: "App" }],
    brief:
      "Set this up as a mini app: the workflows it runs, and an app document " +
      "whose widgets are bound to them."
  },
  {
    id: "empty",
    label: "Empty project",
    kind: "",
    chain: [],
    brief: ""
  }
];

export const DEFAULT_SHAPE_ID = "spot";

export const shapeById = (id: string): ProjectShape =>
  PROJECT_SHAPES.find((shape) => shape.id === id) ?? PROJECT_SHAPES[0];

/** How long a name derived from the prompt may run before it is cut short. */
const NAME_LIMIT = 60;

/**
 * The project's name, taken from the prompt's first line. A name is what the
 * tab and the card carry, so it is trimmed to a phrase rather than left as a
 * paragraph; an empty prompt falls back to the shape's own label.
 */
export const projectNameFromPrompt = (
  prompt: string,
  shape: ProjectShape
): string => {
  const firstLine = prompt.trim().split("\n")[0]?.trim() ?? "";
  if (firstLine.length === 0) {
    return shape.label === "Empty project" ? "New project" : shape.label;
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
  shape: ProjectShape;
  /** Entity names picked from the library, injected by name downstream. */
  entityNames: readonly string[];
}

/**
 * The first thing the project's agent reads: what the user asked for, what
 * shape they picked, and which library entities to season the prompts with.
 * Each part is omitted when it says nothing.
 */
export const composeFirstTurn = ({
  prompt,
  shape,
  entityNames
}: FirstTurnInput): string => {
  const parts = [prompt.trim()];
  if (shape.brief.length > 0) {
    parts.push(shape.brief);
  }
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
 * Below this, a project's total reads as someone poking at the shape once and
 * moving on rather than a spend a real run of it produced.
 */
const MIN_HISTORICAL_SPEND_USD = 1;

/**
 * What this shape has cost before, read off the user's own past projects of
 * the same kind that plausibly ran their chain to the end. There is no
 * "completed" flag on a project, so completion is inferred: a priced total
 * (no unpriced calls, so the number is not a lower bound), above a spend floor
 * that rules out a project abandoned after one cheap call, *and* a timeline
 * document with at least one clip — the cut a shape's chain always ends on. A
 * project whose chain has no cut (the `app` shape) never has enough signal to
 * qualify, so it never contributes an estimate.
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
