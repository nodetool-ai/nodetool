/**
 * useStoryboardAgentBridge
 *
 * Registers a {@link StoryboardAgentHandler} for the surrounding Storyboard
 * surface while it is active, so the `ui_storyboard_*` agent tools operate on
 * this board. Mirrors {@link useTimelineAgentBridge}: only the active surface
 * registers, and the handler is cleared on unmount unless already replaced.
 */

import { useEffect, useMemo } from "react";
import type { Screenplay, Shot } from "@nodetool-ai/protocol";

import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import {
  getStoryboardAgentHandler,
  hasStoryboardAgentHandler,
  setStoryboardAgentHandler,
  type StoryboardAgentHandler,
  type StoryboardShotNode,
  type StoryboardSnapshot
} from "../../components/storyboard/storyboardAgentBridge";
import { useGenerateShot } from "./useGenerateShot";
import { useAssembleTimeline } from "./useAssembleTimeline";

const toShotNode = (shot: Shot): StoryboardShotNode => ({
  id: shot.id,
  index: shot.index,
  slug: shot.slug,
  action: shot.action,
  camera: shot.camera,
  motion: shot.motion,
  durationSeconds: shot.duration_seconds,
  status: shot.status,
  hasKeyframe: !!shot.keyframe,
  hasClip: !!shot.clip,
  costEstimate: shot.cost_estimate ?? null
});

export const useStoryboardAgentBridge = (
  boardId: string,
  active: boolean
): void => {
  const { generateKeyframe, generateClip, generateRevisedClip } =
    useGenerateShot();
  const { assemble } = useAssembleTimeline();

  const handler = useMemo<StoryboardAgentHandler>(() => {
    const store = () => useStoryboardStore.getState();

    const requireBoard = () => {
      const board = store().getBoard(boardId);
      if (!board) {
        throw new Error("No storyboard is open.");
      }
      return board;
    };

    /** Resolve a shot by id, 0-based index, or the "selected" keyword. */
    const requireShot = (target: string): Shot => {
      const board = requireBoard();
      if (target === "selected") {
        const id = board.activeShotId;
        const shot = id ? board.shots.find((s) => s.id === id) : undefined;
        if (!shot) {
          throw new Error("No shot is selected.");
        }
        return shot;
      }
      const byId = board.shots.find((s) => s.id === target);
      if (byId) {
        return byId;
      }
      const asIndex = Number(target);
      if (Number.isInteger(asIndex)) {
        const byIndex = board.shots.find((s) => s.index === asIndex);
        if (byIndex) {
          return byIndex;
        }
      }
      throw new Error(`Shot not found on the storyboard: ${target}`);
    };

    const reRead = (id: string): Shot => {
      const shot = store()
        .getBoard(boardId)
        ?.shots.find((s) => s.id === id);
      if (!shot) {
        throw new Error(`Shot ${id} disappeared after the edit.`);
      }
      return shot;
    };

    const getSnapshot = (): StoryboardSnapshot => {
      const board = requireBoard();
      return {
        boardId,
        title: board.title,
        brief: board.brief,
        style: board.style,
        aspectRatio: board.aspectRatio,
        hasScreenplay: board.screenplay !== null,
        selectedShotId: board.activeShotId,
        shots: board.shots.map(toShotNode)
      };
    };

    return {
      getSnapshot,

      setScreenplay(screenplay: Screenplay) {
        store().setScreenplay(boardId, screenplay);
        return getSnapshot();
      },

      addShot(input) {
        const board = requireBoard();
        const id = crypto.randomUUID();
        const shot: Shot = {
          type: "shot",
          id,
          index: board.shots.length,
          action: input.action,
          camera: input.camera,
          motion: input.motion,
          duration_seconds: input.durationSeconds,
          status: "planned"
        };
        store().upsertShot(boardId, shot);
        if (input.index !== undefined) {
          const current = store().getBoard(boardId)?.shots ?? [];
          const others = current
            .filter((s) => s.id !== id)
            .map((s) => s.id);
          const clamped = Math.max(0, Math.min(input.index, others.length));
          others.splice(clamped, 0, id);
          store().reorderShots(boardId, others);
        }
        return toShotNode(reRead(id));
      },

      updateShot(target, patch) {
        const shot = requireShot(target);
        const next: Partial<Shot> = {};
        if (patch.action !== undefined) next.action = patch.action;
        if (patch.camera !== undefined) next.camera = patch.camera;
        if (patch.motion !== undefined) next.motion = patch.motion;
        if (patch.status !== undefined) next.status = patch.status;
        store().updateShot(boardId, shot.id, next);
        return toShotNode(reRead(shot.id));
      },

      async generateKeyframe(target) {
        const shot = requireShot(target);
        await generateKeyframe(boardId, shot);
        return toShotNode(reRead(shot.id));
      },

      approveShot(target) {
        const shot = requireShot(target);
        store().approveShot(boardId, shot.id);
        return toShotNode(reRead(shot.id));
      },

      async generateClip(target) {
        const shot = requireShot(target);
        await generateClip(boardId, shot);
        return toShotNode(reRead(shot.id));
      },

      async reviseShot(target, instruction) {
        const shot = requireShot(target);
        await generateRevisedClip(boardId, shot, instruction);
        return toShotNode(reRead(shot.id));
      },

      async assembleTimeline() {
        return assemble(boardId);
      },

      selectShot(target) {
        if (!target) {
          store().selectShot(boardId, null);
          return null;
        }
        const shot = requireShot(target);
        store().selectShot(boardId, shot.id);
        return toShotNode(shot);
      }
    };
  }, [boardId, generateKeyframe, generateClip, generateRevisedClip, assemble]);

  useEffect(() => {
    if (!active) return;
    setStoryboardAgentHandler(handler);
    return () => {
      if (
        hasStoryboardAgentHandler() &&
        getStoryboardAgentHandler() === handler
      ) {
        setStoryboardAgentHandler(null);
      }
    };
  }, [active, handler]);
};
