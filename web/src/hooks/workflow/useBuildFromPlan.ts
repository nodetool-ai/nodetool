/**
 * Step 3's action: turn the reviewed plan into a running graph (PRD § 11.3).
 *
 * The build replays the plan through the same node tools an agent drives —
 * `ui_add_node`, `ui_update_node_data`, `ui_connect_nodes` — in plan order, so
 * the canvas fills the way a creator would have filled it and the headless
 * mirror (`build_workflow_from_plan`) produces the same graph. The placement
 * itself comes from `planToPlacement` in `@nodetool-ai/protocol`, shared with
 * the harness, so what the harness graded is what gets placed.
 *
 * The canvas opens as soon as the nodes are down, before validation and before
 * the test run: a creator who is about to see an error should already be
 * looking at the graph the error is about.
 *
 * R6 is why `issues` is part of the result. A plan whose steps name node types
 * that exist can still leave an output fed by nothing, and that graph validates.
 * The landing checklist reports those as the first agent message with the fix
 * proposed, and nothing is applied without a click (PRD § 11.4).
 */

import { useCallback, useState } from "react";
import { planNodeShape, planToPlacement } from "@nodetool-ai/protocol";
import type { WorkflowSetupPlan } from "@nodetool-ai/protocol/api-schemas/workflows.js";

import { FrontendToolRegistry } from "../../lib/tools/frontendTools";
import { getFrontendToolRuntimeState } from "../../lib/tools/frontendToolRuntimeState";
import useMetadataStore from "../../stores/MetadataStore";
import { useWorkflowSetupWriter } from "./useWorkflowSetup";

/** What the landing checklist reads (PRD § 11.4). */
export interface BuildFromPlanResult {
  /** Nodes placed on the canvas. */
  nodeCount: number;
  /** Wiring the builder could not do — the R6 signal, empty on a clean build. */
  issues: string[];
  /** Errors from the graph check. Empty means `Validated` is ticked. */
  validationErrors: string[];
  /** Whether the test run was started, and what it said if it was refused. */
  testRun: { started: boolean; error: string | null };
}

export interface BuildFromPlanInput {
  plan: WorkflowSetupPlan;
  /** The model chosen per role on the setup step, keyed by role. */
  models?: Record<string, unknown>;
  /** Sample values the test run sends, keyed by plan input name. */
  sampleInputs?: Record<string, unknown>;
}

export interface UseBuildFromPlanResult {
  buildFromPlan: (input: BuildFromPlanInput) => Promise<BuildFromPlanResult>;
  building: boolean;
  result: BuildFromPlanResult | null;
}

/** One tool call, through the registry the agent uses. */
let callSeq = 0;
const callTool = (name: string, args: Record<string, unknown>) =>
  FrontendToolRegistry.call(name, args, `build-${++callSeq}`, {
    getState: getFrontendToolRuntimeState
  });

/** The `validation` block `ui_get_graph` returns. */
interface GraphValidation {
  errors?: unknown;
}

export const useBuildFromPlan = (
  workflowId: string
): UseBuildFromPlanResult => {
  const [building, setBuilding] = useState(false);
  const [result, setResult] = useState<BuildFromPlanResult | null>(null);
  const { setSetup } = useWorkflowSetupWriter(workflowId);

  const buildFromPlan = useCallback(
    async (input: BuildFromPlanInput): Promise<BuildFromPlanResult> => {
      setBuilding(true);
      try {
        const metadata = useMetadataStore.getState().metadata;
        const placement = planToPlacement(
          input.plan,
          (nodeType) => {
            const meta = metadata[nodeType];
            return meta ? planNodeShape(meta) : null;
          },
          input.models === undefined ? {} : { models: input.models }
        );

        // The editor has to be open before a node tool can reach it.
        await callTool("ui_open_workflow", { workflow_id: workflowId });

        for (const node of placement.nodes) {
          await callTool("ui_add_node", {
            workflow_id: workflowId,
            id: node.id,
            type: node.type,
            position: node.position,
            properties: node.properties
          });
          // Two writes the add cannot carry: the dynamic slots an edge needs to
          // land on, and the plan step this node came from (PRD § 11.5).
          const data: Record<string, unknown> = {};
          if (node.dynamicProperties !== undefined) {
            data["dynamic_properties"] = node.dynamicProperties;
          }
          if (node.setupStepId !== undefined) {
            data["setupStepId"] = node.setupStepId;
          }
          if (Object.keys(data).length > 0) {
            await callTool("ui_update_node_data", {
              workflow_id: workflowId,
              node_id: node.id,
              data
            });
          }
        }

        for (const edge of placement.edges) {
          await callTool("ui_connect_nodes", {
            workflow_id: workflowId,
            source_node_id: edge.source,
            source_handle: edge.sourceHandle,
            target_node_id: edge.target,
            target_handle: edge.targetHandle
          });
        }

        // The graph is placed: the stage is terminal from here, so a reload
        // lands on the canvas rather than back in the flow (D3).
        await setSetup({ stage: "done" });

        const graph = (await callTool("ui_get_graph", {
          workflow_id: workflowId
        })) as { validation?: GraphValidation };
        const validationErrors = Array.isArray(graph.validation?.errors)
          ? graph.validation.errors.map(String)
          : [];

        let testRun = { started: false, error: null as string | null };
        if (validationErrors.length === 0 && placement.issues.length === 0) {
          try {
            await callTool("ui_run_workflow", {
              workflow_id: workflowId,
              params: input.sampleInputs ?? {}
            });
            testRun = { started: true, error: null };
          } catch (cause) {
            testRun = {
              started: false,
              error: cause instanceof Error ? cause.message : String(cause)
            };
          }
        }

        const built: BuildFromPlanResult = {
          nodeCount: placement.nodes.length,
          issues: placement.issues,
          validationErrors,
          testRun
        };
        setResult(built);
        return built;
      } finally {
        setBuilding(false);
      }
    },
    [setSetup, workflowId]
  );

  return { buildFromPlan, building, result };
};

export default useBuildFromPlan;
