/**
 * useGenerateShot
 *
 * Per-shot generation for the Storyboard surface, adapted from
 * {@link useGenerateClip}. Two entry points:
 *
 *   - `generateKeyframe(boardId, shot)` runs a minimal `TextToImage → Output`
 *     graph (prompt = shot action + board style) to produce the cheap still.
 *   - `generateClip(boardId, shot)` runs `ImageToVideo → Output`, seeded by the
 *     shot's approved keyframe, to render the final clip.
 *
 * Both build a real nodes+edges graph, run it through the per-shot
 * {@link getWorkflowRunnerStore}, register the job on
 * {@link useStoryboardGenerationStore}, and subscribe through the shared
 * GlobalWebSocketManager machinery so completion writes the resulting
 * ImageRef/VideoRef back to the board and settles the shot status.
 */

import { useCallback } from "react";
import type { Edge, Node } from "@xyflow/react";
import type { Shot } from "@nodetool-ai/protocol";
import type { NodeData } from "../../stores/NodeData";
import type { WorkflowAttributes } from "../../stores/ApiTypes";
import { getWorkflowRunnerStore } from "../../stores/WorkflowRunner";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import {
  subscribeShotJob,
  useStoryboardGenerationStore,
  type ShotJobKind
} from "../../stores/storyboard/StoryboardGenerationStore";

const GEN_NODE_ID = "gen";
const OUT_NODE_ID = "out";

/** A per-shot runner store id (isolates each shot's run from its siblings). */
const runnerIdForShot = (shotId: string): string => `storyboard:${shotId}`;

const makeWorkflow = (id: string, name: string): WorkflowAttributes => ({
  id,
  name,
  description: "",
  access: "private",
  thumbnail: "",
  updated_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  settings: { hide_ui: true },
  run_mode: "workflow",
  workspace_id: null
});

const makeNode = (
  id: string,
  type: string,
  x: number,
  properties: Record<string, unknown>,
  workflowId: string
): Node<NodeData> => ({
  id,
  type,
  position: { x, y: 0 },
  data: {
    properties,
    selectable: true,
    dynamic_properties: {},
    workflow_id: workflowId
  }
});

const outputEdge = (): Edge => ({
  id: `${GEN_NODE_ID}-${OUT_NODE_ID}`,
  source: GEN_NODE_ID,
  sourceHandle: "output",
  target: OUT_NODE_ID,
  targetHandle: "value"
});

/** Compose an image prompt from a shot's action, camera framing, and board style. */
const keyframePrompt = (shot: Shot, style: string): string => {
  const parts = [shot.action.trim()];
  if (shot.camera?.framing) {
    parts.push(`${shot.camera.framing} shot`);
  }
  if (style.trim().length > 0) {
    parts.push(style.trim());
  }
  return parts.filter((p) => p.length > 0).join(", ");
};

const clipPrompt = (shot: Shot): string =>
  [shot.motion, shot.action].filter((p) => !!p && p.trim().length > 0).join(", ");

export interface UseGenerateShotResult {
  generateKeyframe: (boardId: string, shot: Shot) => Promise<void>;
  generateClip: (boardId: string, shot: Shot) => Promise<void>;
}

export const useGenerateShot = (): UseGenerateShotResult => {
  const registerJob = useStoryboardGenerationStore((state) => state.registerJob);

  const startJob = useCallback(
    async (
      boardId: string,
      shot: Shot,
      kind: ShotJobKind,
      nodes: Node<NodeData>[],
      edges: Edge[],
      workflowId: string
    ): Promise<void> => {
      const workflow = makeWorkflow(workflowId, shot.slug ?? `Shot ${shot.index + 1}`);
      const runnerStore = getWorkflowRunnerStore(workflowId);
      const jobId = await runnerStore
        .getState()
        .run({}, workflow, nodes, edges, undefined, undefined, true);
      if (!jobId) {
        throw new Error("Workflow runner did not return a job id");
      }
      registerJob(shot.id, boardId, jobId, workflowId, kind);
      await subscribeShotJob(
        jobId,
        {
          shotId: shot.id,
          boardId,
          workflowId,
          kind,
          outputNodeId: OUT_NODE_ID
        },
        false
      );
    },
    [registerJob]
  );

  const generateKeyframe = useCallback(
    async (boardId: string, shot: Shot): Promise<void> => {
      const style = useStoryboardStore.getState().getBoard(boardId)?.style ?? "";
      const board = useStoryboardStore.getState().getBoard(boardId);
      const aspectRatio = board?.aspectRatio ?? "16:9";
      const workflowId = runnerIdForShot(shot.id);
      const nodes: Node<NodeData>[] = [
        makeNode(
          GEN_NODE_ID,
          "nodetool.image.TextToImage",
          0,
          {
            prompt: keyframePrompt(shot, style),
            aspect_ratio: aspectRatio
          },
          workflowId
        ),
        makeNode(
          OUT_NODE_ID,
          "nodetool.output.Output",
          400,
          { name: "keyframe" },
          workflowId
        )
      ];
      await startJob(boardId, shot, "keyframe", nodes, [outputEdge()], workflowId);
    },
    [startJob]
  );

  const generateClip = useCallback(
    async (boardId: string, shot: Shot): Promise<void> => {
      if (!shot.keyframe) {
        throw new Error("Shot has no keyframe to animate. Generate a still first.");
      }
      const board = useStoryboardStore.getState().getBoard(boardId);
      const aspectRatio = board?.aspectRatio ?? "16:9";
      const workflowId = runnerIdForShot(shot.id);
      const nodes: Node<NodeData>[] = [
        makeNode(
          GEN_NODE_ID,
          "nodetool.video.ImageToVideo",
          0,
          {
            image: shot.keyframe,
            prompt: clipPrompt(shot),
            aspect_ratio: aspectRatio,
            duration: shot.duration_seconds
          },
          workflowId
        ),
        makeNode(
          OUT_NODE_ID,
          "nodetool.output.Output",
          400,
          { name: "clip" },
          workflowId
        )
      ];
      await startJob(boardId, shot, "clip", nodes, [outputEdge()], workflowId);
    },
    [startJob]
  );

  return { generateKeyframe, generateClip };
};

export default useGenerateShot;
