/**
 * The six workflow categories of step 2 (PRD § 11.2).
 *
 * A category does two things and no more: it biases which node types the
 * planner is shown, and it picks the run mode step 3 starts on. It is not a
 * template — nothing is placed from it — so a creator who picks the wrong one
 * loses a re-plan, not a graph.
 */

import type { WorkflowSetupRunMode } from "@nodetool-ai/protocol/api-schemas/workflows.js";

import type { OptionCardItem } from "../OptionCardGrid";

export interface WorkflowCategory extends OptionCardItem {
  /**
   * Appended to the brief when the planner's candidate node types are ranked,
   * so "media batch" surfaces the image and video nodes a bare brief would not.
   */
  plannerTerms: readonly string[];
  /** Which run mode step 3 opens on. The creator can still change it. */
  defaultRunMode: WorkflowSetupRunMode;
}

export const WORKFLOW_CATEGORIES: readonly WorkflowCategory[] = [
  {
    id: "content-pipeline",
    title: "Content pipeline",
    description: "Text in, drafted and formatted text out.",
    plannerTerms: ["text", "summarize", "template", "format", "write"],
    defaultRunMode: "manual"
  },
  {
    id: "media-batch",
    title: "Media batch",
    description: "The same render over a list of inputs.",
    plannerTerms: ["image", "video", "audio", "batch", "generate"],
    defaultRunMode: "manual"
  },
  {
    id: "data-extraction",
    title: "Data extraction",
    description: "Pull structured fields out of documents or pages.",
    plannerTerms: ["extract", "pdf", "document", "parse", "dataframe"],
    defaultRunMode: "app"
  },
  {
    id: "research-agent",
    title: "Research agent",
    description: "An agent that searches, reads and reports back.",
    plannerTerms: ["agent", "search", "browser", "research", "summarize"],
    defaultRunMode: "app"
  },
  {
    id: "trigger-automation",
    title: "Automation on a trigger",
    description: "Runs on a schedule or a webhook, with no one watching.",
    plannerTerms: ["trigger", "schedule", "webhook", "automation", "email"],
    defaultRunMode: "trigger"
  },
  {
    id: "chat-app",
    title: "Chat app",
    description: "A conversation with your data behind it.",
    plannerTerms: ["chat", "message", "agent", "collection", "retrieval"],
    defaultRunMode: "app"
  }
];

export const workflowCategory = (
  id: string | undefined
): WorkflowCategory | undefined =>
  WORKFLOW_CATEGORIES.find((category) => category.id === id);

/** The run mode a category opens step 3 on, defaulting to running by hand. */
export const defaultRunModeFor = (
  id: string | undefined
): WorkflowSetupRunMode => workflowCategory(id)?.defaultRunMode ?? "manual";
