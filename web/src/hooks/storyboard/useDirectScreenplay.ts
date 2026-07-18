/**
 * useDirectScreenplay
 *
 * Wires the Storyboard's "Direct" button to a real Director run: builds a
 * one-node `nodetool.creative.Director → Output` graph from the board's brief,
 * style, aspect ratio, and requested shot count, runs it through the workflow
 * runner, and writes the resulting screenplay into the board (which seeds the
 * shot cards). Mirrors the run/subscribe pattern of {@link useGenerateShot},
 * but board-scoped instead of shot-scoped.
 */

import { useCallback, useRef, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import { isScreenplay, type Screenplay } from "@nodetool-ai/protocol";
import type { NodeData } from "../../stores/NodeData";
import type { OutputUpdate, WorkflowAttributes } from "../../stores/ApiTypes";
import { getWorkflowRunnerStore } from "../../stores/WorkflowRunner";
import {
  globalWebSocketManager,
  type WebSocketMessage
} from "../../lib/websocket/GlobalWebSocketManager";
import { normalizeOutputUpdateValue } from "../../stores/outputUpdateValue";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";

const DIRECTOR_NODE_ID = "director";
const OUT_NODE_ID = "out";

const makeWorkflow = (id: string): WorkflowAttributes => ({
  id,
  name: "Direct screenplay",
  description: "",
  access: "private",
  thumbnail: "",
  updated_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  settings: { hide_ui: true },
  run_mode: "workflow",
  workspace_id: null
});

/** Coerce a Director `screenplay` output value into a Screenplay, or null. */
export const coerceScreenplay = (value: unknown): Screenplay | null => {
  let candidate: unknown = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  return isScreenplay(candidate) ? candidate : null;
};

export interface UseDirectScreenplayResult {
  direct: (boardId: string, shotCount: number) => Promise<void>;
  directing: boolean;
  error: string | null;
}

export const useDirectScreenplay = (): UseDirectScreenplayResult => {
  const [directing, setDirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The output captured from the run's output_update, keyed per invocation.
  const outputRef = useRef<unknown>(undefined);

  const direct = useCallback(
    async (boardId: string, shotCount: number): Promise<void> => {
      const board = useStoryboardStore.getState().getBoard(boardId);
      const brief = board?.brief?.trim() ?? "";
      if (brief.length === 0) {
        setError("Write a brief before directing.");
        return;
      }
      const model = board?.directorModel;
      if (!model?.id) {
        setError("Pick a model before directing.");
        return;
      }
      setError(null);
      setDirecting(true);
      outputRef.current = undefined;

      const workflowId = `storyboard-direct:${boardId}`;
      const nodes: Node<NodeData>[] = [
        {
          id: DIRECTOR_NODE_ID,
          type: "nodetool.creative.Director",
          position: { x: 0, y: 0 },
          data: {
            properties: {
              model,
              brief,
              style: board?.style ?? "",
              shot_count: shotCount,
              aspect_ratio: board?.aspectRatio ?? "16:9"
            },
            selectable: true,
            dynamic_properties: {},
            workflow_id: workflowId
          }
        },
        {
          id: OUT_NODE_ID,
          type: "nodetool.output.Output",
          position: { x: 400, y: 0 },
          data: {
            properties: { name: "screenplay" },
            selectable: true,
            dynamic_properties: {},
            workflow_id: workflowId
          }
        }
      ];
      const edges: Edge[] = [
        {
          id: `${DIRECTOR_NODE_ID}-${OUT_NODE_ID}`,
          source: DIRECTOR_NODE_ID,
          sourceHandle: "screenplay",
          target: OUT_NODE_ID,
          targetHandle: "value"
        }
      ];

      try {
        const runnerStore = getWorkflowRunnerStore(workflowId);
        const jobId = await runnerStore
          .getState()
          .run({}, makeWorkflow(workflowId), nodes, edges, undefined, undefined, true);
        if (!jobId) {
          throw new Error("Workflow runner did not return a job id");
        }
        await globalWebSocketManager.ensureConnection();
        await new Promise<void>((resolve, reject) => {
          const unsubscribe = globalWebSocketManager.subscribe(
            jobId,
            (message: WebSocketMessage) => {
              if (
                message.type === "output_update" &&
                message.node_id === OUT_NODE_ID
              ) {
                outputRef.current = normalizeOutputUpdateValue(
                  message as unknown as OutputUpdate
                );
                return;
              }
              if (message.type !== "job_update") {
                return;
              }
              if (message.status === "completed") {
                unsubscribe();
                const screenplay = coerceScreenplay(outputRef.current);
                if (!screenplay) {
                  reject(
                    new Error("Director finished without a usable screenplay.")
                  );
                  return;
                }
                useStoryboardStore
                  .getState()
                  .setScreenplay(boardId, screenplay);
                resolve();
                return;
              }
              if (
                message.status === "failed" ||
                message.status === "timed_out" ||
                message.status === "cancelled"
              ) {
                unsubscribe();
                reject(
                  new Error(
                    typeof message.error === "string" && message.error.length > 0
                      ? message.error
                      : `Director run ${message.status}`
                  )
                );
              }
            }
          );
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setDirecting(false);
      }
    },
    []
  );

  return { direct, directing, error };
};

export default useDirectScreenplay;
