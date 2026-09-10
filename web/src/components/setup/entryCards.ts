/**
 * The creation-flow entry cards (PRD § 6.1) — one list, two hosts.
 *
 * The New Project surface shows all seven, Studio shows three (D24 and D30:
 * Image, Workflow and Game are workspace flows). The promise line on each card
 * is PRD § 6.1 and game-prd Appendix A verbatim, kept here so both hosts say
 * the same thing. Entity is the library-oriented addition to that set.
 *
 * `disabled` with a `disabledReason` naming the phase is how a card waits for
 * its flow to be built. All seven are live now; the field stays on the type for
 * the next one.
 */

import type { OptionCardItem } from "./OptionCardGrid";

export type EntryFlowId =
  | "entity"
  | "storyboard"
  | "video"
  | "script"
  | "image"
  | "workflow"
  | "game";

export interface EntryCard extends OptionCardItem {
  id: EntryFlowId;
}

export const ENTRY_CARDS: readonly EntryCard[] = [
  {
    id: "entity",
    title: "Entity",
    description: "Create a reusable character, place, style, or prop."
  },
  {
    id: "storyboard",
    title: "Storyboard",
    description: "From a sentence to a rendered board in three steps."
  },
  {
    id: "video",
    title: "Video",
    description: "From a sentence to a cut on the timeline, no board."
  },
  {
    id: "script",
    title: "Script",
    description: "From a topic to voiced lines, ready to place."
  },
  {
    id: "image",
    title: "Image",
    description: "From a description to a picked variation in the editor."
  },
  {
    id: "workflow",
    title: "Workflow",
    description: "From a task to a running graph, with the plan reviewed first."
  },
  {
    id: "game",
    title: "Game",
    description: "From a sentence to a running Godot project, assets checked."
  }
];

/** Studio's three cards (D24). */
export const STUDIO_ENTRY_CARDS: readonly EntryCard[] = ENTRY_CARDS.filter(
  (card) => card.id === "storyboard" || card.id === "video" || card.id === "script"
);
