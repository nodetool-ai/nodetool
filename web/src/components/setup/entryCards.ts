/**
 * The creation-flow entry cards (PRD § 6.1) — one list, two hosts.
 *
 * The New Project surface shows all five, Studio shows three (D24: Image and
 * Workflow are workspace flows). Only Storyboard is built, so the rest name
 * the phase that turns them on rather than dying on a click. The promise line
 * on each card is PRD § 6.1 verbatim, kept here so both hosts say the same
 * thing.
 */

import type { OptionCardItem } from "./OptionCardGrid";

export type EntryFlowId =
  | "storyboard"
  | "video"
  | "script"
  | "image"
  | "workflow";

export interface EntryCard extends OptionCardItem {
  id: EntryFlowId;
}

export const ENTRY_CARDS: readonly EntryCard[] = [
  {
    id: "storyboard",
    title: "Storyboard",
    description: "From a sentence to a rendered board in three steps."
  },
  {
    id: "video",
    title: "Video",
    description: "From a sentence to a cut on the timeline, no board.",
    disabled: true,
    disabledReason: "Video ships in phase P6."
  },
  {
    id: "script",
    title: "Script",
    description: "From a topic to voiced lines, ready to place.",
    disabled: true,
    disabledReason: "Script ships in phase P7."
  },
  {
    id: "image",
    title: "Image",
    description: "From a description to a picked variation in the editor.",
    disabled: true,
    disabledReason: "Image ships in phase P8."
  },
  {
    id: "workflow",
    title: "Workflow",
    description: "From a task to a running graph, with the plan reviewed first.",
    disabled: true,
    disabledReason: "Workflow ships in phase P9."
  }
];

/** Studio's three cards (D24). */
export const STUDIO_ENTRY_CARDS: readonly EntryCard[] = ENTRY_CARDS.filter(
  (card) => card.id === "storyboard" || card.id === "video" || card.id === "script"
);
