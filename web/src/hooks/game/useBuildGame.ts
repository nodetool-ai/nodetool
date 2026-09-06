/**
 * Step 3's action: turn the reviewed design into a running graph
 * (game-prd § 5.4).
 *
 * The build replays `gameGraphPlacement` through the same node tools an agent
 * drives — `ui_add_node`, `ui_update_node_data`, `ui_connect_nodes` — in
 * placement order, so the canvas fills the way a creator would have filled it
 * and the headless mirror produces the same graph. The placement is a pure
 * function of manifest, design and choices (D26), shared with the harness, so
 * what the harness graded is what gets placed.
 *
 * The canvas opens as soon as the nodes are down, before validation and before
 * the run: a creator who is about to see an error should already be looking at
 * the graph the error is about.
 *
 * `issues` is part of the result because a graph whose slots are all placed can
 * still be missing the export node, and that graph validates and writes no
 * project. The landing checklist reports them; nothing is auto-fixed.
 */

import { useCallback, useState } from "react";
import {
  gameGraphPlacement,
  planNodeShape,
  type GameAssetManifest,
  type GameGraphChoices
} from "@nodetool-ai/protocol";
import type { GameDesign } from "@nodetool-ai/protocol/api-schemas/workflows.js";

import { FrontendToolRegistry } from "../../lib/tools/frontendTools";
import { getFrontendToolRuntimeState } from "../../lib/tools/frontendToolRuntimeState";
import useMetadataStore from "../../stores/MetadataStore";
import { useGameSetupWriter } from "./useGameSetup";

/** What the landing checklist reads (game-prd § 4.4). */
export interface BuildGameResult {
  /** Nodes placed on the canvas. */
  nodeCount: number;
  /** Chains the builder could not place, empty on a clean build. */
  issues: string[];
  /** Errors from the graph check. Empty means the graph validated. */
  validationErrors: string[];
  /** Whether the run was started, and what it said if it was refused. */
  run: { started: boolean; error: string | null };
}

export interface BuildGameInput {
  manifest: GameAssetManifest;
  design: GameDesign;
  choices: GameGraphChoices;
}

export interface UseBuildGameResult {
  buildGame: (input: BuildGameInput) => Promise<BuildGameResult>;
  building: boolean;
  result: BuildGameResult | null;
}

/** One tool call, through the registry the agent uses. */
let callSeq = 0;
const callTool = (name: string, args: Record<string, unknown>) =>
  FrontendToolRegistry.call(name, args, `game-build-${++callSeq}`, {
    getState: getFrontendToolRuntimeState
  });

/** The `validation` block `ui_get_graph` returns. */
interface GraphValidation {
  errors?: unknown;
}

export const useBuildGame = (workflowId: string): UseBuildGameResult => {
  const [building, setBuilding] = useState(false);
  const [result, setResult] = useState<BuildGameResult | null>(null);
  const { setGame } = useGameSetupWriter(workflowId);

  const buildGame = useCallback(
    async (input: BuildGameInput): Promise<BuildGameResult> => {
      setBuilding(true);
      try {
        const metadata = useMetadataStore.getState().metadata;
        const placement = gameGraphPlacement(
          input.manifest,
          input.design,
          input.choices,
          (nodeType) => {
            const meta = metadata[nodeType];
            return meta ? planNodeShape(meta) : null;
          }
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
          // Two writes the add cannot carry: the dynamic slots the export
          // node's per-slot edges land on, and the slot this node fills, which
          // is what the landing checklist maps a node to a row by.
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
        await setGame({ stage: "done" });

        const graph = (await callTool("ui_get_graph", {
          workflow_id: workflowId
        })) as { validation?: GraphValidation };
        const validationErrors = Array.isArray(graph.validation?.errors)
          ? graph.validation.errors.map(String)
          : [];

        let run = { started: false, error: null as string | null };
        if (validationErrors.length === 0 && placement.issues.length === 0) {
          try {
            await callTool("ui_run_workflow", {
              workflow_id: workflowId,
              params: {}
            });
            run = { started: true, error: null };
          } catch (cause) {
            run = {
              started: false,
              error: cause instanceof Error ? cause.message : String(cause)
            };
          }
        }

        const built: BuildGameResult = {
          nodeCount: placement.nodes.length,
          issues: placement.issues,
          validationErrors,
          run
        };
        setResult(built);
        return built;
      } finally {
        setBuilding(false);
      }
    },
    [setGame, workflowId]
  );

  return { buildGame, building, result };
};

export default useBuildGame;
