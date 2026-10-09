/**
 * Three things the flow keeps on the workflow beyond the fields the protocol
 * schema names, each because losing it changes what gets built or what it
 * costs (PRD § 11.5):
 *
 * - **`plan_source`** — the brief and category the stored plan was written
 *   from. Without it, returning to the category step and pressing its button
 *   re-plans a plan nobody asked to replace (F15).
 * - **`role_models`** — the model picked per model role on step 3. In
 *   component state it survived a scroll and not a remount, so a reload could
 *   resume the right stage and build on a different model (F17).
 * - **`role_voices`** — the voice picked for a voice model on step 3, which
 *   the model's tile id does not carry.
 *
 * `settings.setup` is a passthrough record, so all three travel with the workflow
 * and through `writeWorkflowSetup` untouched. They are parsed here rather than
 * read raw: what comes back off a saved workflow is whatever the last client
 * wrote, and a malformed value has to read as "not chosen", never as a value.
 */

import { z } from "zod";
import type { WorkflowSetup } from "@nodetool-ai/protocol/api-schemas/workflows.js";

/** What the stored plan was generated from. */
export const planSourceSchema = z.object({
  brief: z.string(),
  category: z.string().optional()
});
export type WorkflowPlanSource = z.infer<typeof planSourceSchema>;

/** Role → the tile id (`provider:id`) the creator picked for it. */
export const roleModelsSchema = z.record(z.string(), z.string());
export type WorkflowRoleModels = z.infer<typeof roleModelsSchema>;

/** Role → the voice picked for that role's model, for a voice model. */
export const roleVoicesSchema = z.record(z.string(), z.string());
export type WorkflowRoleVoices = z.infer<typeof roleVoicesSchema>;

export const PLAN_SOURCE_KEY = "plan_source";
export const ROLE_MODELS_KEY = "role_models";
export const ROLE_VOICES_KEY = "role_voices";

export const readPlanSource = (
  setup: WorkflowSetup | null
): WorkflowPlanSource | null => {
  const parsed = planSourceSchema.safeParse(setup?.[PLAN_SOURCE_KEY]);
  return parsed.success ? parsed.data : null;
};

export const readRoleModels = (
  setup: WorkflowSetup | null
): WorkflowRoleModels => {
  const parsed = roleModelsSchema.safeParse(setup?.[ROLE_MODELS_KEY]);
  return parsed.success ? parsed.data : {};
};

export const readRoleVoices = (
  setup: WorkflowSetup | null
): WorkflowRoleVoices => {
  const parsed = roleVoicesSchema.safeParse(setup?.[ROLE_VOICES_KEY]);
  return parsed.success ? parsed.data : {};
};

/** The source of the plan a request with this brief and category would write. */
export const planSourceOf = (
  brief: string,
  category: string | undefined
): WorkflowPlanSource => ({ brief: brief.trim(), category });

/**
 * Whether the stored plan still answers the brief and category on screen.
 *
 * Only the two the planner is given: the planner model is a setting, and
 * swapping it does not make the plan the creator has been editing wrong.
 */
export const planSourceMatches = (
  source: WorkflowPlanSource | null,
  brief: string,
  category: string | undefined
): boolean =>
  source !== null &&
  source.brief === brief.trim() &&
  (source.category ?? "") === (category ?? "");
