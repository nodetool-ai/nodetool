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

import { useCallback, useEffect, useRef, useState } from "react";
import {
  WORKFLOW_INSPIRATION_CHIPS,
  WORKFLOW_PLANNER_SYSTEM_PROMPT,
  WORKFLOW_PLAN_TOOL_DESCRIPTION,
  WORKFLOW_PLAN_TOOL_NAME,
  PLAN_CORE_NODE_TYPES,
  buildWorkflowPlanSchema,
  checkWorkflowPlan,
  planNodeShape,
  refineWorkflowPlan
} from "@nodetool-ai/protocol";
import { plannedCodeStepProblems } from "@nodetool-ai/node-sdk/code-analysis";
import {
  readWorkflowSetup,
  type WorkflowSetupPlan,
  type WorkflowSetupStage
} from "@nodetool-ai/protocol/api-schemas/workflows.js";

import { rpcRequest } from "../../lib/websocket/rpcRequest";
import {
  useWorkflowManager,
  useWorkflowManagerStore
} from "../../contexts/WorkflowManagerContext";
import { planSourceOf, PLAN_SOURCE_KEY } from "../../components/setup/workflow/setupExtras";
import useMetadataStore from "../../stores/MetadataStore";
import type { NodeMetadata } from "../../stores/ApiTypes";
import { computeSearchResults } from "../../utils/nodeSearch";
import { useWorkflowSetupWriter } from "./useWorkflowSetup";
import { workflowCategory } from "../../components/setup/workflow/categories";
import { snippetStepAsCode } from "../../utils/planSnippetSteps";
import { isRecord } from "../../utils/typePredicates";

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
   * and otherwise the reason it was not: the call was refused, or its answer
   * was set aside because the creator canceled, left the stage, or changed the
   * brief or category meanwhile. It never rejects, because the review step's
   * `Re-plan` fires it from a click handler — and it hands the reason back
   * rather than only setting `error`, because the flow shell reads it in the
   * same tick and `error` is a render behind (a provider that is out of quota
   * reported as "did not return a plan").
   */
  planWorkflow: (input: PlanWorkflowInput) => Promise<string | null>;
  /** Ends the active planner request without allowing its reply to commit. */
  cancelPlanning: () => void;
  planning: boolean;
  /**
   * `checking` while the planner repairs its own draft (rounds after the
   * first), so the wait can say the plan is being checked.
   */
  planningPhase: "drafting" | "checking";
  planningStatus: "idle" | "pending" | "canceled" | "error";
  error: string | null;
}

/** Why an answer that arrived was not stored. */
export const PLAN_SET_ASIDE_REASON =
  "The brief, category or step changed while the plan was being written. Plan the steps again.";

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
  // The general-purpose nodes lead: a brief's words rank provider-specific
  // nodes above Text To Image or Agent, and the planner names only what it sees.
  const picked: NodeMetadata[] = PLAN_CORE_NODE_TYPES.flatMap((nodeType) => {
    const meta = metadata[nodeType];
    return meta ? [meta] : [];
  });
  const seen = new Set<string>(picked.map((meta) => meta.node_type));
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
 * so the review step shows a node the build can actually place. A step that
 * lands on a Code-node snippet becomes a Code step carrying the snippet's body.
 */
export const resolvePlanNodeTypes = (
  plan: WorkflowSetupPlan,
  metadata: Record<string, NodeMetadata>
): WorkflowSetupPlan => ({
  ...plan,
  steps: plan.steps.map((step) =>
    snippetStepAsCode(
      step.node_type !== null && step.node_type in metadata
        ? step
        : { ...step, node_type: matchNodeType(step, metadata) }
    )
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
  const [planningStatus, setPlanningStatus] = useState<
    "idle" | "pending" | "canceled" | "error"
  >("idle");
  const [planningPhase, setPlanningPhase] = useState<"drafting" | "checking">(
    "drafting"
  );
  const [error, setError] = useState<string | null>(null);
  const { setSetup } = useWorkflowSetupWriter(workflowId);
  const store = useWorkflowManagerStore();
  const stage = useWorkflowManager(
    (state) =>
      readWorkflowSetup(state.getWorkflow(workflowId)?.settings)?.stage ?? "done"
  );
  // Which request the hook is still waiting for. A planner call outlives the
  // stage that asked for it, so a late answer must neither overwrite a plan a
  // newer request wrote nor pull a creator who has moved on back to the review
  // (F9, the same guard `usePlanBeats` uses). Only what the plan answers
  // invalidates it — the stage, the brief and the category. Any other write to
  // `settings`, a save response included, leaves the request current.
  const requestRef = useRef(0);
  const activeControllerRef = useRef<AbortController | null>(null);

  // A refusal or a cancellation belongs to the step it happened on. Carried
  // to another step it reads as a fault of the plan on screen there.
  const stageRef = useRef(stage);
  useEffect(() => {
    if (stageRef.current === stage) {
      return;
    }
    stageRef.current = stage;
    setError(null);
    setPlanningStatus((current) =>
      current === "error" || current === "canceled" ? "idle" : current
    );
  }, [stage]);

  useEffect(
    () => () => {
      requestRef.current += 1;
      activeControllerRef.current?.abort();
      activeControllerRef.current = null;
    },
    [workflowId]
  );

  // What a plan answers, read from the document: the stage it was asked on,
  // the brief and the category.
  const readPlanInputs = useCallback((): string => {
    const setup = readWorkflowSetup(
      store.getState().getWorkflow(workflowId)?.settings
    );
    const current: [WorkflowSetupStage, string, string] = [
      setup?.stage ?? "done",
      (setup?.brief ?? "").trim(),
      setup?.category ?? ""
    ];
    return JSON.stringify(current);
  }, [store, workflowId]);

  const planWorkflow = useCallback(
    async (input: PlanWorkflowInput): Promise<string | null> => {
      const brief = input.brief.trim();
      if (brief.length === 0) {
        const reason = "Describe the task before planning.";
        setError(reason);
        setPlanningStatus("error");
        return reason;
      }
      const token = (requestRef.current += 1);
      const originInputs = readPlanInputs();
      const controller = new AbortController();
      activeControllerRef.current = controller;
      const isCurrent = () =>
        token === requestRef.current &&
        readPlanInputs() === originInputs &&
        !controller.signal.aborted;
      const setAside = () =>
        controller.signal.aborted
          ? "Planning was canceled."
          : PLAN_SET_ASIDE_REASON;
      setError(null);
      setPlanning(true);
      setPlanningPhase("drafting");
      setPlanningStatus("pending");
      try {
        const pinned = pinnedChipPlan(brief);
        let plan: WorkflowSetupPlan | null = null;
        if (input.model?.id) {
          const metadata = useMetadataStore.getState().metadata;
          const candidates = planCandidates(brief, input.category, metadata);
          const model = input.model;
          // The planner checks its own plan and repairs it before the
          // creator sees it: a plan that would fail at the test run is sent
          // back with the checker's findings, not handed over to be fixed.
          const refined = await refineWorkflowPlan({
            messages: [
              { role: "system", content: WORKFLOW_PLANNER_SYSTEM_PROMPT },
              {
                role: "user",
                content: [
                  `Task: ${brief}`,
                  input.category ? `Kind of workflow: ${input.category}` : "",
                  "",
                  "Candidate node types:",
                  ...candidates
                ]
                  .filter((line) => line !== "")
                  .join("\n")
              }
            ],
            onRound: (round) => {
              if (token === requestRef.current) {
                setPlanningPhase(round > 1 ? "checking" : "drafting");
              }
            },
            generate: async (messages) => {
              if (!isCurrent()) {
                throw new DOMException("The plan was abandoned.", "AbortError");
              }
              const answer = await rpcRequest(
                "generate_text",
                {
                  provider: model.provider,
                  model: model.id,
                  messages,
                  max_tokens: 4096,
                  schema: buildWorkflowPlanSchema(),
                  schema_name: WORKFLOW_PLAN_TOOL_NAME,
                  schema_description: WORKFLOW_PLAN_TOOL_DESCRIPTION
                },
                undefined,
                controller.signal
              );
              return isRecord(answer.data) ? answer.data : null;
            },
            // Steps the planner left unnamed, or named with a type this
            // install does not have, are matched against the registry here —
            // the flow's whole point is a plan the build can place.
            normalize: (draft) => resolvePlanNodeTypes(draft, metadata),
            check: (draft) =>
              checkWorkflowPlan(draft, {
                lookup: (nodeType) => {
                  const meta = metadata[nodeType];
                  return meta ? planNodeShape(meta) : null;
                },
                checkCode: plannedCodeStepProblems
              })
          });
          plan = refined.plan;
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
          return setAside();
        }
        if (!resolved) {
          const reason = input.model?.id
            ? "The planner did not return a plan. Try again, or edit the steps by hand."
            : "Connect a provider to plan this, or start from one of the examples.";
          setError(reason);
          setPlanningStatus("error");
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
          return setAside();
        }
        // The provider's own words — a 429, a model that no longer exists, a
        // missing key. Reporting them beats a generic refusal: only these say
        // what the creator has to change.
        const reason = cause instanceof Error ? cause.message : String(cause);
        setError(reason);
        setPlanningStatus("error");
        return reason;
      } finally {
        if (activeControllerRef.current === controller) {
          activeControllerRef.current = null;
          setPlanning(false);
          if (!controller.signal.aborted) {
            setPlanningStatus((current) =>
              current === "pending" ? "idle" : current
            );
          }
        }
      }
    },
    [readPlanInputs, setSetup]
  );

  const cancelPlanning = useCallback(() => {
    const controller = activeControllerRef.current;
    if (!controller) {
      return;
    }
    requestRef.current += 1;
    controller.abort();
    activeControllerRef.current = null;
    setPlanning(false);
    setError(null);
    setPlanningStatus("canceled");
  }, []);

  return {
    planWorkflow,
    cancelPlanning,
    planning,
    planningPhase,
    planningStatus,
    error
  };
};

export default usePlanWorkflow;
