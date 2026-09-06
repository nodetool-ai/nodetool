/**
 * The Workflow flow's planner (PRD § 11.2).
 *
 * One `generate_text` call answered as structured output against the plan
 * schema, over the node types the live registry actually has. The candidates in
 * the prompt come from the same ranking `ui_search_nodes` uses, so a step names
 * a type the editor can place — and a step the model cannot name comes back
 * `null` rather than as a plausible guess, which is what D23's red marker is
 * for.
 *
 * `planWorkflow` places no node and starts no job (criterion 3, D4). It writes
 * the plan onto `settings.setup` and moves the stage to `review`. Everything
 * after that is text the creator can edit before anything is spent.
 */

import { useCallback, useState } from "react";
import {
  WORKFLOW_INSPIRATION_CHIPS,
  WORKFLOW_PLANNER_SYSTEM_PROMPT,
  WORKFLOW_PLAN_TOOL_DESCRIPTION,
  WORKFLOW_PLAN_TOOL_NAME,
  buildWorkflowPlanSchema,
  parseWorkflowPlan
} from "@nodetool-ai/protocol";
import type { WorkflowSetupPlan } from "@nodetool-ai/protocol/api-schemas/workflows.js";

import { rpcRequest } from "../../lib/websocket/rpcRequest";
import useMetadataStore from "../../stores/MetadataStore";
import type { NodeMetadata } from "../../stores/ApiTypes";
import { computeSearchResults } from "../../utils/nodeSearch";
import { useWorkflowSetupWriter } from "./useWorkflowSetup";
import { workflowCategory } from "../../components/setup/workflow/categories";

/** How many candidate node types the planner prompt carries. */
const CANDIDATE_LIMIT = 40;

export interface PlanWorkflowInput {
  brief: string;
  category?: string;
  /** Provider and model id for the planner call. */
  model: { provider: string; id: string } | null;
}

export interface UsePlanWorkflowResult {
  /**
   * Plan a brief and store the result. Resolves `true` when a plan was written
   * and `false` when the call was refused — the reason is in `error`. It never
   * rejects, because the review step's `Re-plan` fires it from a click handler;
   * the flow shell reads the boolean and throws its own message.
   */
  planWorkflow: (input: PlanWorkflowInput) => Promise<boolean>;
  planning: boolean;
  error: string | null;
}

/**
 * The node types offered to the planner, ranked against the brief with the
 * category's bias terms appended (PRD § 11.2: the category biases node
 * selection).
 */
export const planCandidates = (
  brief: string,
  category: string | undefined,
  metadata: Record<string, NodeMetadata>
): string[] => {
  const bias = workflowCategory(category)?.plannerTerms ?? [];
  const query = [brief, ...bias].join(" ").trim();
  if (query.length === 0) {
    return [];
  }
  const { sortedResults } = computeSearchResults(
    Object.values(metadata) as Parameters<typeof computeSearchResults>[0],
    query,
    []
  );
  return sortedResults
    .slice(0, CANDIDATE_LIMIT)
    .map(
      (result) =>
        `- ${result.node_type}: ${result.title} — ${
          result.description.split("\n")[0]
        }`
    );
};

/**
 * The plan a shipped inspiration chip carries, when the brief is one verbatim.
 *
 * A creator who presses a chip and has no provider connected still gets a plan
 * to review, and it is the same plan the harness builds and grades (criterion
 * 5) — so what they see on screen is what was checked.
 */
export const pinnedChipPlan = (brief: string): WorkflowSetupPlan | null =>
  WORKFLOW_INSPIRATION_CHIPS.find(
    (chip) => chip.brief.toLowerCase() === brief.trim().toLowerCase()
  )?.plan ?? null;

export const usePlanWorkflow = (workflowId: string): UsePlanWorkflowResult => {
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setSetup } = useWorkflowSetupWriter(workflowId);

  const planWorkflow = useCallback(
    async (input: PlanWorkflowInput): Promise<boolean> => {
      const brief = input.brief.trim();
      if (brief.length === 0) {
        setError("Describe the task before planning.");
        return false;
      }
      setError(null);
      setPlanning(true);
      try {
        const pinned = pinnedChipPlan(brief);
        let plan: WorkflowSetupPlan | null = null;
        if (input.model?.id) {
          const metadata = useMetadataStore.getState().metadata;
          const candidates = planCandidates(brief, input.category, metadata);
          const answer = await rpcRequest("generate_text", {
            provider: input.model.provider,
            model: input.model.id,
            system: WORKFLOW_PLANNER_SYSTEM_PROMPT,
            prompt: [
              `Task: ${brief}`,
              input.category ? `Kind of workflow: ${input.category}` : "",
              "",
              "Candidate node types:",
              ...candidates
            ]
              .filter((line) => line !== "")
              .join("\n"),
            max_tokens: 4096,
            schema: buildWorkflowPlanSchema(),
            schema_name: WORKFLOW_PLAN_TOOL_NAME,
            schema_description: WORKFLOW_PLAN_TOOL_DESCRIPTION
          });
          plan = answer.data ? parseWorkflowPlan(answer.data) : null;
        }
        // No model, or an answer that was not a plan: a shipped chip falls back
        // to its pinned plan so the creator still reaches the review step.
        const resolved = plan ?? pinned;
        if (!resolved) {
          setError(
            input.model?.id
              ? "The planner did not return a plan. Try again, or edit the steps by hand."
              : "Connect a provider to plan this, or start from one of the examples."
          );
          return false;
        }
        // Nothing above placed a node — criterion 3.
        await setSetup({ plan: resolved, stage: "review" });
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return false;
      } finally {
        setPlanning(false);
      }
    },
    [setSetup]
  );

  return { planWorkflow, planning, error };
};

export default usePlanWorkflow;
