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

/**
 * Shots with a start in flight, before `registerJob` marks them active in the
 * generation store. Without this, two rapid clicks (or concurrent agent
 * calls) both pass the store check and start two paid jobs, and the second
 * registration orphans the first subscription. Mirrors the timeline's
 * `startingClips` guard.
 */
const startingShots = new Set<string>();

/** True when the shot already has a queued/running job or a start in flight. */
const isShotBusy = (shotId: string): boolean => {
  if (startingShots.has(shotId)) return true;
  const job = useStoryboardGenerationStore.getState().shotJobs[shotId];
  return job?.status === "queued" || job?.status === "running";
};

export const __resetStartingShotsForTests = (): void => {
  startingShots.clear();
};

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
  generateRevisedClip: (
    boardId: string,
    shot: Shot,
    instruction: string
  ) => Promise<void>;
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
      // Single-flight per shot: skip when a job is active or a start is
      // already in the pre-registration window.
      if (isShotBusy(shot.id)) {
        return;
      }
      startingShots.add(shot.id);
      try {
        const workflow = makeWorkflow(
          workflowId,
          shot.slug ?? `Shot ${shot.index + 1}`
        );
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
      } finally {
        startingShots.delete(shot.id);
      }
    },
    [registerJob]
  );

  const generateKeyframe = useCallback(
    async (boardId: string, shot: Shot): Promise<void> => {
      const board = useStoryboardStore.getState().getBoard(boardId);
      const style = board?.style ?? "";
      const aspectRatio = board?.aspectRatio ?? "16:9";
      const workflowId = runnerIdForShot(shot.id);
      const nodes: Node<NodeData>[] = [
        makeNode(
          GEN_NODE_ID,
          "nodetool.image.TextToImage",
          0,
          {
            prompt: keyframePrompt(shot, style),
            aspect_ratio: aspectRatio,
            // Board-level still model; omitted = the node's default model.
            ...(board?.imageModel ? { model: board.imageModel } : {})
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

  const generateRevisedClip = useCallback(
    async (boardId: string, shot: Shot, instruction: string): Promise<void> => {
      if (!shot.clip) {
        throw new Error("Shot has no clip to revise — generate one first.");
      }
      const prompt = instruction.trim();
      if (prompt.length === 0) {
        throw new Error("A revision instruction is required.");
      }
      const workflowId = runnerIdForShot(shot.id);
      const nodes: Node<NodeData>[] = [
        makeNode(
          GEN_NODE_ID,
          "nodetool.video.VideoToVideo",
          0,
          {
            video: shot.clip,
            prompt
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

  return { generateKeyframe, generateClip, generateRevisedClip };
};

export default useGenerateShot;
