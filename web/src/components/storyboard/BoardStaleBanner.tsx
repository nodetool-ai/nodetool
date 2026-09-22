/**
 * BoardStaleBanner
 *
 * The board toolbar's "these versions are out of date" line. A style change,
 * a model change or a rewritten action leaves already-rendered stills and
 * clips describing a board that no longer exists; the banner counts them and
 * offers the one action that costs money — `Re-render stills`.
 *
 * Nothing here renders automatically (PRD D12): a style change marks versions
 * stale and spends nothing. The creator clicks, and only the shots whose
 * *selected* still is stale are enqueued. Clips stay stale until the toolbar's
 * `Render clips`.
 *
 * With nothing stale the component renders null — not an empty banner, not a
 * zero count. A toolbar that reserves space for a message it has none of is a
 * layout shift every creator pays for (E1 criterion 7).
 */

import { memo, useCallback, useMemo } from "react";
import {
  currentRenderInputs,
  isVersionStale,
  type RenderInputs,
  type RenderInputsDraft
} from "@nodetool-ai/protocol";

import { boardRenderContext } from "../../lib/storyboard/boardRenderContext";
import { useBoard } from "../../stores/storyboard/StoryboardStore";
import { useEntities } from "../../serverState/useEntities";
import { useGenerateShot } from "../../hooks/storyboard/useGenerateShot";
import { AlertBanner, EditorButton, FlexRow, SPACING } from "../ui_primitives";

export type StaleInputReason =
  | "action or prompt"
  | "model"
  | "aspect ratio"
  | "style"
  | "render mode"
  | "selected still"
  | "references";

const renderInputReasons = (
  recorded: RenderInputs,
  current: RenderInputsDraft
): StaleInputReason[] => {
  const reasons: StaleInputReason[] = [];
  if (recorded.style_entity_id !== current.style_entity_id) reasons.push("style");
  if (recorded.prompt_hash !== current.prompt_hash && reasons.length === 0) {
    reasons.push("action or prompt");
  }
  if (recorded.model !== current.model) reasons.push("model");
  if (recorded.aspect_ratio !== current.aspect_ratio) reasons.push("aspect ratio");
  const recordedRenderMode =
    recorded.kind === "clip" && recorded.render_mode === undefined
      ? recorded.source_version_id === undefined
        ? "direct"
        : "keyframe"
      : recorded.render_mode;
  if (recordedRenderMode !== current.render_mode) reasons.push("render mode");
  if (
    current.source_version_id &&
    recorded.source_version_id !== current.source_version_id
  ) {
    reasons.push("selected still");
  }
  if (
    JSON.stringify(recorded.reference_asset_ids ?? []) !==
    JSON.stringify(current.reference_asset_ids ?? [])
  ) {
    reasons.push("references");
  }
  return reasons;
};

/** "3 stills", "1 clip" — the count and its noun. */
const countLabel = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

/**
 * The banner's sentence, or null when nothing is stale.
 *
 * Pure and exported so the null case can be asserted without a DOM: it is the
 * same condition the component early-returns on.
 */
export const staleBannerMessage = (
  staleStills: number,
  staleClips: number,
  reasons: readonly StaleInputReason[] = []
): string | null => {
  const parts: string[] = [];
  if (staleStills > 0) {
    parts.push(countLabel(staleStills, "still"));
  }
  if (staleClips > 0) {
    parts.push(countLabel(staleClips, "clip"));
  }
  if (parts.length === 0) {
    return null;
  }
  const verb = parts.length === 1 && staleStills + staleClips === 1 ? "is" : "are";
  const reasonText = reasons.length > 0 ? ` (${reasons.join(" and ")})` : "";
  return `Inputs changed${reasonText}. ${parts.join(" and ")} ${verb} stale.`;
};

export interface BoardStaleBannerProps {
  /** The open board. Its shots and settings are what staleness is read from. */
  boardId: string;
  /** Disables `Re-render stills` — a read-only board, or a run in flight. */
  disabled?: boolean;
}

/**
 * The board values staleness is measured against.
 *
 * `style_entity_id` is the board's one style entity — the id `setStylePreset`
 * writes — so changing the preset is what marks versions stale, not every cast
 * edit.
 */

const BoardStaleBannerImpl = ({
  boardId,
  disabled = false
}: BoardStaleBannerProps) => {
  const board = useBoard(boardId);
  const { data: allEntities } = useEntities();
  const { generateKeyframe, generateClip } = useGenerateShot();

  const stale = useMemo(
    () =>
      board.shots.map((shot) => ({
        shot,
        context: boardRenderContext(board, allEntities ?? [], shot)
      })),
    [board, allEntities]
  );
  const staleStills = useMemo(
    () => stale
      .filter(({ shot, context }) => isVersionStale(shot.keyframe, shot, context))
      .map(({ shot }) => shot),
    [stale]
  );
  const staleClips = useMemo(
    () => stale
      .filter(({ shot, context }) => isVersionStale(shot.clip, shot, context))
      .map(({ shot }) => shot),
    [stale]
  );
  const reasons = useMemo(() => {
    const found = new Set<StaleInputReason>();
    for (const { shot, context } of stale) {
      for (const version of [shot.keyframe, shot.clip]) {
        const recorded = version?.render_inputs;
        if (!recorded || !isVersionStale(version, shot, context)) continue;
        for (const reason of renderInputReasons(
          recorded,
          currentRenderInputs(shot, context, recorded.kind)
        )) {
          found.add(reason);
        }
      }
    }
    return [...found];
  }, [stale]);

  // One shot that cannot start records the reason on itself and is toasted, so
  // a single failure must not stop the rest of the re-render.
  const handleRerenderStills = useCallback(() => {
    for (const shot of staleStills) {
      void generateKeyframe(boardId, shot).catch(() => undefined);
    }
  }, [staleStills, generateKeyframe, boardId]);

  const handleRerenderClips = useCallback(() => {
    for (const shot of staleClips) {
      void generateClip(boardId, shot).catch(() => undefined);
    }
  }, [staleClips, generateClip, boardId]);

  const message = staleBannerMessage(
    staleStills.length,
    staleClips.length,
    reasons
  );
  if (!message) {
    return null;
  }

  return (
    <AlertBanner
      severity="info"
      compact
      className="board-stale-banner"
      action={
        <FlexRow gap={SPACING.xs} wrap>
          {staleStills.length > 0 && (
          <EditorButton
            variant="outlined"
            onClick={handleRerenderStills}
            disabled={disabled}
          >
            Regenerate stale stills
          </EditorButton>
          )}
          {staleClips.length > 0 && (
            <EditorButton
              variant="outlined"
              onClick={handleRerenderClips}
              disabled={disabled}
            >
              Regenerate stale clips
            </EditorButton>
          )}
        </FlexRow>
      }
    >
      {message}
    </AlertBanner>
  );
};

export const BoardStaleBanner = memo(BoardStaleBannerImpl);

export default BoardStaleBanner;
