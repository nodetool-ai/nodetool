/**
 * useStoryboardAgentBridge
 *
 * Registers a {@link StoryboardAgentHandler} under the surrounding Storyboard
 * surface's board id, so the `ui_storyboard_*` agent tools can address this
 * board by id whether or not it is the focused surface. The handler is cleared
 * on unmount unless it has already been replaced.
 *
 * Every write here is exactly one store action, so one tool call is one undo
 * entry (PRD § 7.10). The two places that need more than the store — the
 * Director run and the style-preset entity lookup — go through the same hooks
 * the UI uses (`useDirectScreenplay`, `useEntities`), so there is one caller of
 * each and the tool cannot drift from the button.
 */

import { useEffect, useMemo } from "react";
import type { Entity, ImageRef, Screenplay, Shot } from "@nodetool-ai/protocol";
import { isVersionStale } from "@nodetool-ai/protocol";

import {
  useStoryboardStore,
  type StoryboardBoard
} from "../../stores/storyboard/StoryboardStore";
import {
  getStoryboardAgentHandler,
  hasStoryboardAgentHandler,
  setStoryboardAgentHandler,
  type StoryboardAgentHandler,
  type StoryboardRenderOptions,
  type StoryboardRenderResult,
  type StoryboardSceneNode,
  type StoryboardShotNode,
  type StoryboardSnapshot,
  type StoryboardVersionKind
} from "../../components/storyboard/storyboardAgentBridge";
import { useGenerateShot } from "./useGenerateShot";
import { useAssembleTimeline } from "./useAssembleTimeline";
import { useExtractScriptFromBoard } from "./useExtractScriptFromBoard";
import { useReprojectShots } from "./useReprojectShots";
import { useDirectScreenplay } from "./useDirectScreenplay";
import { useEntities } from "../../serverState/useEntities";
import { sceneOrder } from "../../lib/storyboard/sceneOrder";
import { linkedScriptId } from "../../lib/scriptStoryboardLink";
import { assetLocator } from "../../utils/mediaRef";

/** Shot count a Director run defaults to when the tool names none. */
const DEFAULT_SHOT_COUNT = 6;

/**
 * The board values staleness is measured against. `style_entity_id` is the
 * board's one style entity — the same id `setStylePreset` writes — so a preset
 * change is what makes a version stale, not every cast edit.
 */
const renderContext = (board: StoryboardBoard, entities: readonly Entity[]) => {
  const styleIds = new Set(
    entities.filter((e) => e.kind === "style").map((e) => e.id)
  );
  const styleEntityId =
    [...board.entityIds].reverse().find((id) => styleIds.has(id)) ?? null;
  return {
    aspect_ratio: board.aspectRatio,
    image_model: board.imageModel?.id ?? "",
    video_model: board.videoModel?.id ?? "",
    style_entity_id: styleEntityId,
    style: board.style,
    scenes: board.screenplay?.scenes ?? null
  };
};

const toSceneNode = (
  scene: { id: string; slugline: string; lighting?: string },
  shotIds: string[]
): StoryboardSceneNode => ({
  id: scene.id,
  slugline: scene.slugline,
  lighting: scene.lighting,
  shotIds
});

export const useStoryboardAgentBridge = (boardId: string): void => {
  const { generateKeyframe, generateClip, generateRevisedClip } =
    useGenerateShot();
  const { assemble } = useAssembleTimeline();
  const { extract } = useExtractScriptFromBoard();
  const { reproject } = useReprojectShots();
  const { direct } = useDirectScreenplay();
  const { data: allEntities } = useEntities();

  const handler = useMemo<StoryboardAgentHandler>(() => {
    const store = () => useStoryboardStore.getState();
    const entities: readonly Entity[] = allEntities ?? [];

    const requireBoard = (): StoryboardBoard => {
      const board = store().getBoard(boardId);
      if (!board) {
        throw new Error(`No storyboard "${boardId}" is open.`);
      }
      return board;
    };

    const toShotNode = (shot: Shot): StoryboardShotNode => {
      const context = renderContext(requireBoard(), entities);
      return {
        id: shot.id,
        index: shot.index,
        slug: shot.slug,
        action: shot.action,
        camera: shot.camera,
        motion: shot.motion,
        durationSeconds: shot.duration_seconds,
        durationSource: shot.duration_source,
        status: shot.status,
        sceneId: shot.scene_id ?? null,
        dialogue: shot.dialogue,
        notes: shot.notes,
        hasKeyframe: !!shot.keyframe,
        hasClip: !!shot.clip,
        keyframeVersionCount:
          shot.keyframe_versions?.length ?? (shot.keyframe ? 1 : 0),
        clipVersionCount: shot.clip_versions?.length ?? (shot.clip ? 1 : 0),
        staleKeyframe: isVersionStale(shot.keyframe, shot, context),
        staleClip: isVersionStale(shot.clip, shot, context),
        costEstimate: shot.cost_estimate ?? null
      };
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

    /** The shots a render call acts on. `"all"` is every shot, in order. */
    const requireShots = (target: string): Shot[] => {
      if (target === "all") {
        return [...requireBoard().shots].sort((a, b) => a.index - b.index);
      }
      return [requireShot(target)];
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

    const requireScene = (sceneId: string): StoryboardSceneNode => {
      const board = requireBoard();
      const group = sceneOrder(board.shots, board.screenplay?.scenes).find(
        (g) => g.sceneId === sceneId
      );
      if (!group) {
        throw new Error(
          `No scene "${sceneId}" is on this storyboard. Read ui_storyboard_get_state for the scene ids.`
        );
      }
      return toSceneNode(
        group.scene ?? { id: sceneId, slugline: "" },
        group.shots.map((s) => s.id)
      );
    };

    const getSnapshot = (): StoryboardSnapshot => {
      const board = requireBoard();
      const groups = sceneOrder(board.shots, board.screenplay?.scenes);
      return {
        boardId,
        title: board.title,
        brief: board.brief,
        style: board.style,
        aspectRatio: board.aspectRatio,
        setupStage: board.setupStage,
        genre: board.genre,
        scenes: groups
          .filter((group) => group.scene !== null)
          .map((group) =>
            toSceneNode(
              // Filtered above: a group with a scene carries one.
              group.scene as { id: string; slugline: string; lighting?: string },
              group.shots.map((s) => s.id)
            )
          ),
        entityIds: board.entityIds,
        hasScreenplay: board.screenplay !== null,
        scriptId: linkedScriptId(board),
        selectedShotId: board.activeShotId,
        shots: board.shots.map(toShotNode)
      };
    };

    /**
     * Enqueue a render for each selected shot, dropping the ones `staleOnly`
     * excludes. `staleOnly` reads the *selected* version's render record, so a
     * shot with no version and no record is not stale and is not rendered.
     */
    const renderShots = async (
      target: string,
      kind: StoryboardVersionKind,
      options: StoryboardRenderOptions | undefined,
      run: (shot: Shot) => Promise<void>
    ): Promise<StoryboardRenderResult> => {
      const selected = requireShots(target);
      const context = renderContext(requireBoard(), entities);
      const chosen = options?.staleOnly
        ? selected.filter((shot) =>
            isVersionStale(
              kind === "keyframe" ? shot.keyframe : shot.clip,
              shot,
              context
            )
          )
        : selected;
      const chosenIds = new Set(chosen.map((shot) => shot.id));
      for (const shot of chosen) {
        await run(shot);
      }
      return {
        shots: chosen.map((shot) => toShotNode(reRead(shot.id))),
        skipped: selected
          .filter((shot) => !chosenIds.has(shot.id))
          .map((shot) => shot.id)
      };
    };

    return {
      getSnapshot,

      setScreenplay(screenplay: Screenplay) {
        store().setScreenplay(boardId, screenplay);
        return getSnapshot();
      },

      setSetup(input) {
        requireBoard();
        store().setSetup(boardId, input);
        return getSnapshot();
      },

      async direct({ redirect, shotCount }) {
        const board = requireBoard();
        if (board.screenplay && !redirect) {
          throw new Error(
            `Storyboard ${boardId} already has a screenplay. Pass redirect: true to run the Director over it again — retained shots keep their ids and media.`
          );
        }
        if (board.brief.trim() === "") {
          throw new Error(
            `Storyboard ${boardId} has no brief, so there is nothing to direct. Write one with ui_storyboard_set_setup.`
          );
        }
        if (!board.directorModel?.id) {
          throw new Error(
            `Storyboard ${boardId} has no director model. Pick one on the board before directing.`
          );
        }
        await direct(boardId, shotCount ?? DEFAULT_SHOT_COUNT);
        // The hook reports a failed run through React state the tool layer
        // cannot read, so the board itself is the evidence: a run that landed
        // wrote a new screenplay.
        if (requireBoard().screenplay === board.screenplay) {
          throw new Error(
            `The Director run for storyboard ${boardId} produced no screenplay. The board is unchanged; check the model and the provider, then retry.`
          );
        }
        return getSnapshot();
      },

      setEntityIds(entityIds: string[]) {
        requireBoard();
        store().setEntityIds(boardId, entityIds);
        return getSnapshot();
      },

      addShot(input) {
        const board = requireBoard();
        // An explicit anchor is the scene-safe insert: `insertShot` puts the
        // new shot in the anchor's scene, which a bare index cannot say.
        if (input.afterShotId !== undefined) {
          const after = requireShot(input.afterShotId);
          const id = store().insertShot(boardId, after.id);
          if (!id) {
            throw new Error(`Could not insert a shot on storyboard ${boardId}.`);
          }
          store().updateShot(boardId, id, {
            action: input.action,
            slug: input.slug,
            camera: input.camera,
            motion: input.motion,
            duration_seconds: input.durationSeconds
          });
          return toShotNode(reRead(id));
        }
        const id = crypto.randomUUID();
        const shot: Shot = {
          type: "shot",
          id,
          index: board.shots.length,
          slug: input.slug,
          action: input.action,
          camera: input.camera,
          motion: input.motion,
          duration_seconds: input.durationSeconds,
          status: "planned"
        };
        store().upsertShot(boardId, shot);
        if (input.index !== undefined) {
          const current = store().getBoard(boardId)?.shots ?? [];
          const at = Math.max(
            0,
            Math.min(input.index, Math.max(current.length - 1, 0))
          );
          // moveShot, not reorderShots: an absolute order that lands a shot
          // between two scenes is refused, and the caller gave a position.
          store().moveShot(boardId, id, shot.scene_id ?? null, at);
        }
        return toShotNode(reRead(id));
      },

      updateShot(target, patch) {
        const shot = requireShot(target);
        const next: Partial<Shot> = {};
        if (patch.action !== undefined) next.action = patch.action;
        if (patch.slug !== undefined) next.slug = patch.slug;
        if (patch.camera !== undefined) next.camera = patch.camera;
        if (patch.motion !== undefined) next.motion = patch.motion;
        if (patch.status !== undefined) next.status = patch.status;
        if (patch.dialogue !== undefined) next.dialogue = patch.dialogue;
        if (patch.notes !== undefined) next.notes = patch.notes;
        if (patch.durationSeconds !== undefined) {
          next.duration_seconds = patch.durationSeconds;
          // Typing a length pins the shot to it, matching the inspector field.
          next.duration_source = "manual";
        }
        if (patch.durationSource !== undefined) {
          next.duration_source = patch.durationSource;
        }
        store().updateShot(boardId, shot.id, next);
        return toShotNode(reRead(shot.id));
      },

      moveShot(target, sceneId, position) {
        const shot = requireShot(target);
        store().moveShot(boardId, shot.id, sceneId, position);
        return toShotNode(reRead(shot.id));
      },

      duplicateShot(target) {
        const shot = requireShot(target);
        const id = store().duplicateShot(boardId, shot.id);
        if (!id) {
          throw new Error(`Could not duplicate shot ${shot.id}.`);
        }
        return toShotNode(reRead(id));
      },

      removeShot(target) {
        const shot = requireShot(target);
        store().removeShot(boardId, shot.id);
        return { removed: shot.id };
      },

      updateScene(sceneId, patch) {
        requireScene(sceneId);
        store().updateScene(boardId, sceneId, patch);
        return requireScene(sceneId);
      },

      createScene(afterSceneId) {
        requireBoard();
        const id = store().createScene(boardId, afterSceneId ?? null);
        if (!id) {
          throw new Error(`Could not create a scene on storyboard ${boardId}.`);
        }
        return requireScene(id);
      },

      mergeScene(sceneId) {
        const board = requireBoard();
        const groups = sceneOrder(board.shots, board.screenplay?.scenes);
        const at = groups.findIndex((group) => group.sceneId === sceneId);
        if (at === -1) {
          throw new Error(`No scene "${sceneId}" is on this storyboard.`);
        }
        const into = at > 0 ? groups[at - 1].sceneId : null;
        if (into === null) {
          throw new Error(
            `Scene ${sceneId} is the first scene; there is nothing before it to merge into.`
          );
        }
        store().mergeSceneIntoPrevious(boardId, sceneId);
        return { merged: sceneId, into };
      },

      setStyle({ entityId, descriptor }) {
        requireBoard();
        if (entityId !== undefined) {
          const entity = entities.find((e) => e.id === entityId);
          if (!entity) {
            throw new Error(
              `No entity "${entityId}" is in the library. Call ui_entity_list, or pass a descriptor instead.`
            );
          }
          if (entity.kind !== "style") {
            throw new Error(
              `Entity "${entityId}" is a ${entity.kind}, not a style. Cast it with ui_storyboard_set_entities.`
            );
          }
          store().setStylePreset(boardId, entityId, entities);
          return getSnapshot();
        }
        if (descriptor === undefined) {
          throw new Error(
            "ui_storyboard_set_style needs an entityId or a descriptor."
          );
        }
        store().setStyle(boardId, descriptor);
        return getSnapshot();
      },

      selectVersion(target, kind, version) {
        const shot = requireShot(target);
        if (kind === "keyframe") {
          store().selectKeyframeVersion(boardId, shot.id, version);
        } else {
          store().selectClipVersion(boardId, shot.id, version);
        }
        return toShotNode(reRead(shot.id));
      },

      deleteVersion(target, kind, version) {
        const shot = requireShot(target);
        if (kind === "keyframe") {
          store().removeKeyframeVersion(boardId, shot.id, version);
        } else {
          store().removeClipVersion(boardId, shot.id, version);
        }
        return toShotNode(reRead(shot.id));
      },

      addKeyframeVersion(target, assetId, flipOf) {
        const shot = requireShot(target);
        const keyframe: ImageRef = {
          type: "image",
          asset_id: assetId,
          uri: assetLocator(assetId)
        };
        if (flipOf !== undefined) {
          // Provenance for a flip or an editor pass: which version it came
          // from. It carries no render record, so it never reads stale.
          (keyframe as ImageRef & { flip_of: string }).flip_of = flipOf;
        }
        store().setShotKeyframe(boardId, shot.id, keyframe);
        return toShotNode(reRead(shot.id));
      },

      async generateKeyframe(target, options) {
        return renderShots(target, "keyframe", options, (shot) =>
          generateKeyframe(boardId, shot)
        );
      },

      async generateClip(target, options) {
        return renderShots(target, "clip", options, (shot) =>
          generateClip(boardId, shot)
        );
      },

      async reviseShot(target, instruction) {
        const shot = requireShot(target);
        await generateRevisedClip(boardId, shot, instruction);
        return toShotNode(reRead(shot.id));
      },

      async assembleTimeline() {
        return assemble(boardId);
      },

      async extractScript(options) {
        return extract(boardId, { relink: options?.relink });
      },

      async reprojectShots(targets) {
        const shotIds = targets?.map((target) => requireShot(target).id);
        return reproject(boardId, { shotIds });
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
  }, [
    boardId,
    allEntities,
    direct,
    generateKeyframe,
    generateClip,
    generateRevisedClip,
    assemble,
    extract,
    reproject
  ]);

  useEffect(() => {
    if (!boardId) return;
    setStoryboardAgentHandler(boardId, handler);
    return () => {
      if (
        hasStoryboardAgentHandler(boardId) &&
        getStoryboardAgentHandler(boardId) === handler
      ) {
        setStoryboardAgentHandler(boardId, null);
      }
    };
  }, [boardId, handler]);
};
