import React, { lazy, Suspense, useEffect, useMemo, useRef } from "react";
import {
  resolveEffectiveProductionRequirement,
  type Shot
} from "@nodetool-ai/protocol";
import {
  buildStoryboardDesignFrame,
  frameSizeForAspect,
  makeSequence,
  resolveShotSource
} from "@nodetool-ai/timeline";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import {
  createTimelineInstance,
  TimelineProvider,
  useTimelinePlaybackStore,
  useTimelinePlaybackStoreApi
} from "../../stores/timeline/TimelineInstance";
import { useStoryboardDesignSources } from "../../serverState/useStoryboardDesignSources";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import { PlaybackClock } from "../timeline/preview/PlaybackClock";
import {
  Box,
  Caption,
  LoadingSpinner,
  ToolbarIconButton,
  SPACING
} from "../ui_primitives";
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
  const sourceShots = useMemo(
    () => board?.shots.map((value) => value.id === shot.id ? shot : value) ?? [],
    [board?.shots, shot]
  );
  const sources = useStoryboardDesignSources(sourceShots);
  const preview = useMemo(() => {
    if (!board) {
      return null;
    }
    if (sources.error) {
      return {error: sources.error.message};
    }
    const shots = structuredClone(sourceShots);
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
        if (!entityId) {
          continue;
        }
        if (!sources.data) {
          return null;
        }
        const entity = sources.data.entitiesByReference[entityId];
        const assetId = entity?.reference_images?.[0]?.asset_id;
        if (!assetId) {
          return {
            error: `Entity ${entityId} needs a reference image before its design frame can be reviewed.`
          };
        }
        if (
          protection?.entity_id &&
          sources.data.entitiesByReference[protection.entity_id]?.id !== entity.id
        ) {
          return {
            error: `Element ${element.id} references a different entity from its protected source. Update the production inputs before reviewing.`
          };
        }
        for (const declaredId of [element.asset_id, protection?.asset_id]) {
          if (declaredId && sources.data.assetsByReference[declaredId]?.id !== assetId) {
            return {
              error: `Entity ${entityId} no longer points to the exact declared source asset. Update the production inputs before reviewing.`
            };
          }
        }
        element.entity_id = entity.id;
        if (protection?.entity_id) {
          protection.entity_id = entity.id;
        }
        if (element.asset_id) {
          element.asset_id = assetId;
        }
        if (protection?.asset_id) {
          protection.asset_id = assetId;
        }
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
      {
        style: board.style,
        context: board.creativeContext,
        entities: Object.values(sources.data?.entitiesByReference ?? {})
      }
    );
    if (frame.validation.length) {
      return {
        error: frame.validation.map((issue) => issue.message).join(" ")
      };
    }
    const instance = createTimelineInstance();
    instance.doc.getState().loadSequence(
      makeSequence({
        ...frame.document,
        width,
        height,
        durationMs: Math.max(
          ...frame.document.clips.map((clip) => clip.startMs + clip.durationMs),
          1
        )
      })
    );
    instance.playback.getState().seek(frame.timeMs);
    const durationMs = Math.max(1, (shot.duration_seconds ?? 4) * 1000);
    return {
      instance,
      fingerprint: frame.fingerprint,
      video: resolveShotSource(shot)?.kind === "video",
      startMs: frame.timeMs - durationMs / 2,
      endMs: frame.timeMs + durationMs / 2
    };
  }, [board, shot, sourceShots, sources.data, sources.error, boardId]);
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
            <>
              <PreviewCompositor quality="full" />
              {preview.video && (
                <ComposedShotPlayback
                  startMs={preview.startMs}
                  endMs={preview.endMs}
                />
              )}
            </>
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

function ComposedShotPlayback({
  startMs,
  endMs
}: {
  startMs: number;
  endMs: number;
}): React.ReactElement {
  const playback = useTimelinePlaybackStoreApi();
  const playing = useTimelinePlaybackStore((state) => state.isPlaying);
  const clock = useRef<PlaybackClock | null>(null);
  useEffect(() => {
    const current = new PlaybackClock(() => playback.getState());
    clock.current = current;
    return () => {
      current.stop();
      playback.getState().pause();
      clock.current = null;
    };
  }, [playback]);
  const toggle = (event: React.MouseEvent): void => {
    event.stopPropagation();
    if (playing) {
      clock.current?.stop();
      playback.getState().pause();
      return;
    }
    playback.getState().seek(startMs);
    playback.getState().play();
    clock.current?.start(startMs, 1, null, endMs, {
      floorMs: startMs,
      onReachEnd: () => {
        playback.getState().pause();
        playback.getState().seek((startMs + endMs) / 2);
      }
    });
  };
  return (
    <Box
      sx={{
        position: "absolute",
        bottom: SPACING.sm,
        left: SPACING.sm,
        pointerEvents: "auto"
      }}
    >
      <ToolbarIconButton
        icon={playing ? <PauseIcon /> : <PlayArrowIcon />}
        tooltip={playing ? "Pause composed shot" : "Play composed shot"}
        ariaLabel={playing ? "Pause composed shot" : "Play composed shot"}
        onClick={toggle}
      />
    </Box>
  );
}
