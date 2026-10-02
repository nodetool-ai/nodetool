import React, { lazy, Suspense, useMemo } from "react";
import {
  resolveEffectiveProductionRequirement,
  type Shot
} from "@nodetool-ai/protocol";
import {
  buildStoryboardDesignFrame,
  frameSizeForAspect,
  makeSequence
} from "@nodetool-ai/timeline";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import {
  createTimelineInstance,
  TimelineProvider
} from "../../stores/timeline/TimelineInstance";
import { useEntities } from "../../serverState/useEntities";
import { Box, Caption, LoadingSpinner } from "../ui_primitives";
import ReportBugButton from "../support/ReportBugButton";

const PreviewCompositor = lazy(async () => {
  const module = await import("../timeline/preview/PreviewCompositor");
  return { default: module.PreviewCompositor };
});

interface ShotDesignFrameProps {
  boardId: string;
  shot: Shot;
}

/** Live derived media. This instance never becomes an editable Timeline or a source asset. */
export default function ShotDesignFrame({
  boardId,
  shot
}: ShotDesignFrameProps): React.ReactElement {
  const board = useStoryboardStore((state) => state.boards[boardId]);
  const { data: entities } = useEntities();
  const preview = useMemo(() => {
    if (!board) { return null; }
    const shots = structuredClone(
      board.shots.map((value) => (value.id === shot.id ? shot : value))
    );
    for (const value of shots) {
      value.production = resolveEffectiveProductionRequirement(
        undefined,
        value.production
      );
      for (const element of value.graphics?.elements ?? []) {
        const protection = value.production?.protected_inputs?.find(
          (input) => input.id === element.protected_input_id
        );
        const entityId = element.entity_id ?? protection?.entity_id;
        if (!entityId) { continue; }
        const assetId = entities?.find((entity) => entity.id === entityId)
          ?.reference_images?.[0]?.asset_id;
        if (!assetId && value.id === shot.id) {
          return {
            error: `Entity ${entityId} needs a reference image before its design frame can be reviewed.`
          };
        }
        if (!assetId) { continue; }
        if (element.kind === "asset" && !element.asset_id) {
          element.asset_id = assetId;
        }
        if (
          protection &&
          !protection.asset_id &&
          ["product", "logo", "source_asset"].includes(protection.kind)
        ) {
          protection.asset_id = assetId;
        }
      }
    }
    const { width, height } = frameSizeForAspect(board.aspectRatio);
    const frame = buildStoryboardDesignFrame(
      {
        boardId,
        shots,
        width,
        height,
        motionDesign: board.screenplay?.motion_design
      },
      shot.id,
      { style: board.style, context: board.creativeContext, entities }
    );
    if (frame.validation.length) {
      return {
        error: frame.validation.map((issue) => issue.message).join(" ")
      };
    }
    const instance = createTimelineInstance();
    instance.doc
      .getState()
      .loadSequence(
        makeSequence({
          ...frame.document,
          width,
          height,
          durationMs: Math.max(
            ...frame.document.clips.map(
              (clip) => clip.startMs + clip.durationMs
            ),
            1
          )
        })
      );
    instance.playback.getState().seek(frame.timeMs);
    return { instance, fingerprint: frame.fingerprint };
  }, [board, shot, entities, boardId]);
  return (
    <Box
      role="region"
      aria-label={`Composited design frame for shot ${shot.index + 1}`}
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        aspectRatio: (board?.aspectRatio ?? "16:9").replace(":", " / "),
        pointerEvents: "none"
      }}
    >
      {preview && "instance" in preview ? (
        <TimelineProvider
          key={preview.fingerprint}
          instance={preview.instance}
          active={false}
        >
          <Suspense fallback={<LoadingSpinner />}>
            <PreviewCompositor quality="quarter" />
          </Suspense>
        </TimelineProvider>
      ) : preview && "error" in preview ? (
        <Box sx={{ pointerEvents: "auto" }}>
          <Caption role="alert">{preview.error}</Caption>
          <ReportBugButton
            context={{
              source: "panel-crash",
              summary: "Design frame unavailable",
              errorText: preview.error
            }}
          />
        </Box>
      ) : (
        <LoadingSpinner />
      )}
    </Box>
  );
}
