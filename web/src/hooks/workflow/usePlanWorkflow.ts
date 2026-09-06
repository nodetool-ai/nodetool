/**
 * The Workflow flow's planner (PRD § 11.2).
 *
 * One `generate_text` call answered as structured output against the plan
 * schema, over the node types the live registry actually has. The candidates in
 * the prompt come from the same ranking `ui_search_nodes` uses — the brief, its
 * clauses and the category's terms each ranked apart, so a two-job brief does
 * not spend the whole prompt on its first job.
 *
 * Whatever the model then names, every step is resolved against the registry
 * before the plan is stored: a step it left `null`, or named with a type this
 * install does not have, is matched to the type the registry ranks first for
 * what the step says about itself. Only a step the registry ranks nothing for
 * reaches the review step unnamed, which is what D23's red marker is for.
 *
 * `planWorkflow` places no node and starts no job (criterion 3, D4). It writes
 * the plan onto `settings.setup` and moves the stage to `review`. Everything
 * after that is text the creator can edit before anything is spent.
 */

import { useCallback, useRef, useState } from "react";
import {
  WORKFLOW_INSPIRATION_CHIPS,
  WORKFLOW_PLANNER_SYSTEM_PROMPT,
  WORKFLOW_PLAN_TOOL_DESCRIPTION,
  WORKFLOW_PLAN_TOOL_NAME,
  buildWorkflowPlanSchema,
  parseWorkflowPlan
} from "@nodetool-ai/protocol";
import {
  readWorkflowSetup,
  type WorkflowSetupPlan,
  type WorkflowSetupStage
} from "@nodetool-ai/protocol/api-schemas/workflows.js";

import { rpcRequest } from "../../lib/websocket/rpcRequest";
import { useWorkflowManagerStore } from "../../contexts/WorkflowManagerContext";
import { planSourceOf, PLAN_SOURCE_KEY } from "../../components/setup/workflow/setupExtras";
import useMetadataStore from "../../stores/MetadataStore";
import type { NodeMetadata } from "../../stores/ApiTypes";
import { computeSearchResults } from "../../utils/nodeSearch";
import { useWorkflowSetupWriter } from "./useWorkflowSetup";
import { workflowCategory } from "../../components/setup/workflow/categories";

/** How many candidate node types the planner prompt carries. */
const CANDIDATE_LIMIT = 48;

/** How many hits one query contributes before the next query gets its turn. */
const PER_QUERY_LIMIT = 12;

/**
 * Where one brief splits into the jobs its steps do. "Summarize a PDF and email
 * it" ranked as one string buries the mail nodes under the summarize nodes; the
 * clauses ranked apart put both in the prompt.
 */
const CLAUSE_SEPARATORS = /,|;|->|→|\bthen\b|\band\b|\bafter that\b/i;

export interface PlanWorkflowInput {
  brief: string;
  category?: string;
  /** Provider and model id for the planner call. */
  model: { provider: string; id: string } | null;
}

export interface UsePlanWorkflowResult {
  /**
   * Plan a brief and store the result. Resolves `null` when a plan was written
   * and the reason when the call was refused. It never rejects, because the
   * review step's `Re-plan` fires it from a click handler — and it hands the
   * reason back rather than only setting `error`, because the flow shell reads
   * it in the same tick and `error` is a render behind (a provider that is out
   * of quota reported as "did not return a plan").
   */
  planWorkflow: (input: PlanWorkflowInput) => Promise<string | null>;
  planning: boolean;
  error: string | null;
}

const nodeCatalog = (
  metadata: Record<string, NodeMetadata>
): Parameters<typeof computeSearchResults>[0] =>
  Object.values(metadata) as Parameters<typeof computeSearchResults>[0];

/** The node types the registry ranks for one query, best first. */
const rankedTypes = (
  query: string,
  metadata: Record<string, NodeMetadata>,
  limit: number
): NodeMetadata[] => {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return [];
  }
  const { sortedResults } = computeSearchResults(
    nodeCatalog(metadata),
    trimmed,
    []
  );
  return sortedResults.slice(0, limit);
};

const candidateLine = (result: NodeMetadata): string =>
  `- ${result.node_type}: ${result.title} — ${
    (result.description ?? "").split("\n")[0]
  }`;

/** The brief, then each clause of it, then the category's bias terms. */
export const candidateQueries = (
  brief: string,
  category: string | undefined
): string[] => {
  const clauses = brief
    .split(CLAUSE_SEPARATORS)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length >= 3);
  const bias = workflowCategory(category)?.plannerTerms ?? [];
  const queries = [brief.trim(), ...clauses, ...bias, bias.join(" ")];
  return [...new Set(queries.filter((query) => query.length > 0))];
};

/**
 * The node types offered to the planner: every query of
 * {@link candidateQueries} ranked on its own, then interleaved.
 *
 * One blended query was the whole list before, and a two-job brief spent all
 * forty slots on the first job — so the second step had no candidate to name
 * and came back null. Round-robin instead, so each clause and each category
 * term puts its best hits in the prompt.
 */
export const planCandidates = (
  brief: string,
  category: string | undefined,
  metadata: Record<string, NodeMetadata>
): string[] => {
  const ranked = candidateQueries(brief, category).map((query) =>
    rankedTypes(query, metadata, PER_QUERY_LIMIT)
  );
  const picked: NodeMetadata[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < PER_QUERY_LIMIT; index += 1) {
    for (const results of ranked) {
      const result = results[index];
      if (!result || seen.has(result.node_type)) {
        continue;
      }
      seen.add(result.node_type);
      picked.push(result);
      if (picked.length >= CANDIDATE_LIMIT) {
        return picked.map(candidateLine);
      }
    }
  }
  return picked.map(candidateLine);
};

/**
 * The registry's own answer for a step the planner could not name, or named
 * with a type the registry does not have.
 *
 * The planner is told to return null rather than guess, and a wrong guess is
 * still worse than none — so this does not guess either: it asks the same
 * ranking `ui_search_nodes` uses, in order of what the step states about
 * itself, and takes the first real hit. When the registry ranks nothing for any
 * of them, the step stays null and D23's red marker gets it.
 */
export const matchNodeType = (
  step: {
    title: string;
    summary: string;
    node_type: string | null;
    model_role?: string;
  },
  metadata: Record<string, NodeMetadata>
): string | null => {
  // The name the planner reached for, without its namespace: a step that asked
  // for `nodetool.text.Summarizer` means the Summarizer that does exist.
  const named = step.node_type?.split(".").pop() ?? "";
  const queries = [
    [named, step.title].join(" "),
    [step.title, step.model_role ?? ""].join(" "),
    step.summary
  ];
  for (const query of queries) {
    const hit = rankedTypes(query, metadata, 1)[0];
    if (hit) {
      return hit.node_type;
    }
  }
  return null;
};

/**
 * Resolve every step of a plan against the live registry.
 *
 * A step the planner named correctly is left alone. Any other step — unnamed,
 * or naming a type this install does not have — is matched against the registry
 * so the review step shows a node the build can actually place.
 */
export const resolvePlanNodeTypes = (
  plan: WorkflowSetupPlan,
  metadata: Record<string, NodeMetadata>
): WorkflowSetupPlan => ({
  ...plan,
  steps: plan.steps.map((step) =>
    step.node_type !== null && step.node_type in metadata
      ? step
      : { ...step, node_type: matchNodeType(step, metadata) }
  )
});

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
  const store = useWorkflowManagerStore();
  // Which request the hook is still waiting for. A planner call outlives the
  // stage that asked for it, so a late answer must neither overwrite a plan a
  // newer request wrote nor pull a creator who has moved on back to the review
  // (F9, the same guard `usePlanBeats` uses).
  const requestRef = useRef(0);

  const readStage = useCallback(
    (): WorkflowSetupStage =>
      readWorkflowSetup(store.getState().getWorkflow(workflowId)?.settings)
        ?.stage ?? "done",
    [store, workflowId]
  );

  const planWorkflow = useCallback(
    async (input: PlanWorkflowInput): Promise<string | null> => {
      const brief = input.brief.trim();
      if (brief.length === 0) {
        const reason = "Describe the task before planning.";
        setError(reason);
        return reason;
      }
      const token = (requestRef.current += 1);
      const originStage = readStage();
      const isCurrent = () =>
        token === requestRef.current && readStage() === originStage;
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
          // Steps the planner left unnamed, or named with a type this
          // install does not have, are matched against the registry here —
          // the flow's whole point is a plan the build can place.
          plan = plan ? resolvePlanNodeTypes(plan, metadata) : null;
        }
        // No model, or an answer that was not a plan: a shipped chip falls back
        // to its pinned plan so the creator still reaches the review step.
        const resolved =
          plan ??
          (pinned
            ? resolvePlanNodeTypes(
                pinned,
                useMetadataStore.getState().metadata
              )
            : null);
        // The creator left the stage this plan was asked from, or asked again.
        // The plan they are looking at now stays, and the refusal of a request
        // they abandoned is not reported over what they are reading.
        if (!isCurrent()) {
          return null;
        }
        if (!resolved) {
          const reason = input.model?.id
            ? "The planner did not return a plan. Try again, or edit the steps by hand."
            : "Connect a provider to plan this, or start from one of the examples.";
          setError(reason);
          return reason;
        }
        // Nothing above placed a node — criterion 3. `plan_source` records what
        // this plan answers, so returning to the category step and pressing its
        // button continues to this plan rather than replacing it (F15).
        await setSetup({
          plan: resolved,
          stage: "review",
          [PLAN_SOURCE_KEY]: planSourceOf(brief, input.category)
        });
        return null;
      } catch (cause) {
        if (!isCurrent()) {
          return null;
        }
        // The provider's own words — a 429, a model that no longer exists, a
        // missing key. Reporting them beats a generic refusal: only these say
        // what the creator has to change.
        const reason = cause instanceof Error ? cause.message : String(cause);
        setError(reason);
        return reason;
      } finally {
        if (token === requestRef.current) {
          setPlanning(false);
        }
      }
    },
    [readStage, setSetup]
  );

  return { planWorkflow, planning, error };
};

export default usePlanWorkflow;
