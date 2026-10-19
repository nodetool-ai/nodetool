/** @jsxImportSource @emotion/react */
/**
 * KeyframedPropertyRow — one property row the way Premiere's Effect Controls
 * draws it.
 *
 * - The stopwatch left of the label turns animation on and off. Off, the
 *   field edits the clip's value. On, the field shows the value at the
 *   playhead and every edit writes a keyframe there.
 * - With the stopwatch on, a second line shows the clip's keyframes for this
 *   property on a lane as long as the clip, with the playhead, and the
 *   ◀ ◆ ▶ navigator: jump to the previous keyframe, add or delete one at the
 *   playhead, jump to the next. Click the lane to move the playhead; drag a
 *   diamond to retime it; right-click one for its easing or to delete it.
 *
 * Every edit goes through `editClipKeyframes` as one undo step. The edit math
 * lives in `keyframeRows.ts`.
 */
import React, { memo, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import TimerIcon from "@mui/icons-material/Timer";
import DiamondOutlinedIcon from "@mui/icons-material/DiamondOutlined";
import DiamondIcon from "@mui/icons-material/Diamond";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

import {
  adjacentKeyframeMs,
  keyframeEasingAt,
  moveKeyframes,
  setKeyframeEasing,
  type TimelineClip
} from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import {
  useTimelinePlaybackStoreApi,
  useTimelineStoreApi
} from "../../../stores/timeline/TimelineInstance";
import {
  BORDER_RADIUS,
  ContextMenu,
  Divider,
  FlexRow,
  MenuItemPrimitive,
  SPACING,
  StateIconButton,
  ToolbarIconButton,
  Z_INDEX
} from "../../ui_primitives";
import { InspectorPillInput, InspectorRow } from "./InspectorPrimitives";
import { formatTimecode, parseFiniteNumber } from "./InspectorPrimitives.helpers";
import {
  commitInputValue,
  inputValueAt,
  isRowKeyframed,
  rowHasKeyframeAt,
  rowKeyframeTimesMs,
  rowProperties,
  toggleRowKeyframeAt,
  toggleRowStopwatch,
  type KeyframeInputSpec,
  type KeyframeRowSpec
} from "./keyframeRows";

type RowLabelKey =
  | "i18n-cont-inspector-02.keyframes.properties.opacity"
  | "i18n-cont-inspector-02.keyframes.properties.position"
  | "i18n-cont-inspector-02.keyframes.properties.scale"
  | "i18n-cont-inspector-02.keyframes.properties.rotation"
  | "i18n-cont-inspector-02.keyframes.properties.orbit"
  | "i18n-cont-inspector-02.keyframes.properties.fieldOfView"
  | "i18n-cont-inspector-02.keyframes.properties.zoom";

const ROW_LABEL_KEYS: Readonly<Record<string, RowLabelKey>> = {
  opacity: "i18n-cont-inspector-02.keyframes.properties.opacity",
  position: "i18n-cont-inspector-02.keyframes.properties.position",
  scale: "i18n-cont-inspector-02.keyframes.properties.scale",
  rotation: "i18n-cont-inspector-02.keyframes.properties.rotation",
  cameraOrbit: "i18n-cont-inspector-02.keyframes.properties.orbit",
  cameraFov: "i18n-cont-inspector-02.keyframes.properties.fieldOfView",
  cameraZoom: "i18n-cont-inspector-02.keyframes.properties.zoom"
} as const;

type InputLabelKey =
  | "i18n-cont-inspector-02.keyframes.inputs.opacity"
  | "i18n-cont-inspector-02.keyframes.inputs.positionX"
  | "i18n-cont-inspector-02.keyframes.inputs.positionY"
  | "i18n-cont-inspector-02.keyframes.inputs.scaleX"
  | "i18n-cont-inspector-02.keyframes.inputs.scaleY"
  | "i18n-cont-inspector-02.keyframes.inputs.rotationDegrees"
  | "i18n-cont-inspector-02.keyframes.inputs.cameraAzimuth"
  | "i18n-cont-inspector-02.keyframes.inputs.cameraElevation"
  | "i18n-cont-inspector-02.keyframes.inputs.cameraFieldOfView"
  | "i18n-cont-inspector-02.keyframes.inputs.cameraZoom";

const INPUT_LABEL_KEYS: Readonly<Record<string, InputLabelKey>> = {
  Opacity: "i18n-cont-inspector-02.keyframes.inputs.opacity",
  "Position X": "i18n-cont-inspector-02.keyframes.inputs.positionX",
  "Position Y": "i18n-cont-inspector-02.keyframes.inputs.positionY",
  "Scale X": "i18n-cont-inspector-02.keyframes.inputs.scaleX",
  "Scale Y": "i18n-cont-inspector-02.keyframes.inputs.scaleY",
  "Rotation in degrees": "i18n-cont-inspector-02.keyframes.inputs.rotationDegrees",
  "Camera azimuth": "i18n-cont-inspector-02.keyframes.inputs.cameraAzimuth",
  "Camera elevation": "i18n-cont-inspector-02.keyframes.inputs.cameraElevation",
  "Camera field of view": "i18n-cont-inspector-02.keyframes.inputs.cameraFieldOfView",
  "Camera zoom": "i18n-cont-inspector-02.keyframes.inputs.cameraZoom"
} as const;

/** Pointer travel (px) before a press on a diamond becomes a drag. */
const DRAG_SLOP_PX = 3;
const LANE_HEIGHT = 16;
const DIAMOND_SIZE = 8;

const laneStyles = (theme: Theme, disabled: boolean) =>
  css({
    position: "relative",
    flex: "1 1 auto",
    minWidth: 0,
    height: LANE_HEIGHT,
    borderRadius: BORDER_RADIUS.xs,
    background: theme.vars.palette.action.hover,
    cursor: disabled ? "default" : "pointer",
    touchAction: "none",
    opacity: disabled ? 0.6 : 1
  });

const spanStyles = (theme: Theme) =>
  css({
    position: "absolute",
    top: "50%",
    height: 1,
    background: theme.vars.palette.text.disabled,
    pointerEvents: "none"
  });

const playheadStyles = (theme: Theme) =>
  css({
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    marginLeft: -0.5,
    background: theme.vars.palette.error.main,
    pointerEvents: "none",
    zIndex: Z_INDEX.base + 2
  });

const diamondStyles = (theme: Theme) =>
  css({
    position: "absolute",
    top: "50%",
    width: DIAMOND_SIZE,
    height: DIAMOND_SIZE,
    marginLeft: -DIAMOND_SIZE / 2,
    marginTop: -DIAMOND_SIZE / 2,
    padding: 0,
    transform: "rotate(45deg)",
    background: theme.vars.palette.text.secondary,
    border: `1px solid ${theme.vars.palette.background.paper}`,
    cursor: "ew-resize",
    zIndex: Z_INDEX.base + 3,
    "&[data-current='true']": {
      background: theme.vars.palette.primary.main
    },
    "&:focus-visible": {
      outline: `1px solid ${theme.vars.palette.primary.main}`,
      outlineOffset: 1
    },
    // An 8px diamond is a small target; widen the hit area, not the mark.
    "&::after": {
      content: '""',
      position: "absolute",
      inset: -5
    }
  });

interface LaneProps {
  clip: TimelineClip;
  row: KeyframeRowSpec;
  /** Clip-relative playhead, or null while it is off the clip. */
  playheadMs: number | null;
  fps: number;
  disabled: boolean;
  onSeek: (clipRelativeMs: number) => void;
  onMove: (fromMs: number, toMs: number) => void;
  onEasing: (atMs: number, easing: string) => void;
  onDelete: (atMs: number) => void;
}

interface DragState {
  pointerId: number;
  fromMs: number;
  toMs: number;
  startX: number;
  moved: boolean;
}

/** The clip's keyframes for one row, on a lane as long as the clip. */
export const KeyframeLane: React.FC<LaneProps> = memo(
  ({ clip, row, playheadMs, fps, disabled, onSeek, onMove, onEasing, onDelete }) => {
    const theme = useTheme();
    const { t } = useTranslation();
    const laneRef = useRef<HTMLDivElement>(null);
    const [drag, setDrag] = useState<DragState | null>(null);
    const [menu, setMenu] = useState<{ x: number; y: number; atMs: number } | null>(
      null
    );
    const times = rowKeyframeTimesMs(clip, row);
    const duration = Math.max(1, clip.durationMs);
    const propertyLabelKey = ROW_LABEL_KEYS[row.id];
    const propertyLabel = propertyLabelKey ? t(propertyLabelKey) : row.label;
    /** The easings a keyframe offers, in Premiere's order. */
    const easingOptions = [
      { value: "linear", label: t("i18n-cont-inspector-02.keyframes.easing.linear") },
      { value: "easeIn", label: t("i18n-cont-inspector-02.keyframes.easing.easeIn") },
      { value: "easeOut", label: t("i18n-cont-inspector-02.keyframes.easing.easeOut") },
      { value: "easeInOut", label: t("i18n-cont-inspector-02.keyframes.easing.easeInOut") },
      { value: "hold", label: t("i18n-cont-inspector-02.keyframes.easing.hold") }
    ];

    /** Clip-relative ms under `clientX`, snapped to the sequence's frames. */
    const msAt = useCallback(
      (clientX: number): number => {
        const rect = laneRef.current?.getBoundingClientRect();
        if (!rect || rect.width <= 0) return 0;
        const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const frameMs = 1000 / Math.max(1, fps);
        const abs = Math.round((clip.startMs + frac * duration) / frameMs) * frameMs;
        return Math.max(0, Math.min(duration, abs - clip.startMs));
      },
      [clip.startMs, duration, fps]
    );

    const handleLanePointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (disabled || e.button !== 0) return;
        onSeek(msAt(e.clientX));
      },
      [disabled, msAt, onSeek]
    );

    const handleDiamondPointerDown = useCallback(
      (e: React.PointerEvent<HTMLButtonElement>, t: number) => {
        e.stopPropagation();
        if (disabled || e.button !== 0) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        setDrag({ pointerId: e.pointerId, fromMs: t, toMs: t, startX: e.clientX, moved: false });
      },
      [disabled]
    );

    const handleDiamondPointerMove = useCallback(
      (e: React.PointerEvent<HTMLButtonElement>) => {
        if (!drag || e.pointerId !== drag.pointerId) return;
        const moved = drag.moved || Math.abs(e.clientX - drag.startX) > DRAG_SLOP_PX;
        if (!moved) return;
        setDrag({ ...drag, moved, toMs: msAt(e.clientX) });
      },
      [drag, msAt]
    );

    const handleDiamondPointerUp = useCallback(
      (e: React.PointerEvent<HTMLButtonElement>) => {
        if (!drag || e.pointerId !== drag.pointerId) return;
        setDrag(null);
        if (drag.moved && Math.abs(drag.toMs - drag.fromMs) > 0.5) {
          onMove(drag.fromMs, drag.toMs);
          onSeek(drag.toMs);
        } else {
          onSeek(drag.fromMs);
        }
      },
      [drag, onMove, onSeek]
    );

    const handleDiamondKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLButtonElement>, t: number) => {
        if (disabled) return;
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          e.stopPropagation();
          onDelete(t);
        }
      },
      [disabled, onDelete]
    );

    const closeMenu = useCallback(() => setMenu(null), []);
    const currentEasing =
      menu && keyframeEasingAt(clip, rowProperties(row)[0], menu.atMs);

    const first = times[0];
    const last = times[times.length - 1];
    const pct = (ms: number) => `${(ms / duration) * 100}%`;

    return (
      <div
        ref={laneRef}
        css={laneStyles(theme, disabled)}
        onPointerDown={handleLanePointerDown}
        data-testid={`keyframe-lane-${row.id}`}
        aria-label={t("i18n-cont-inspector-02.keyframes.laneLabel", { property: propertyLabel })}
        role="group"
      >
        {times.length > 1 && (
          <span
            css={spanStyles(theme)}
            style={{ left: pct(first), width: pct(last - first) }}
          />
        )}
        {playheadMs !== null && (
          <span css={playheadStyles(theme)} style={{ left: pct(playheadMs) }} />
        )}
        {times.map((keyframeMs) => {
          const shownMs =
            drag && drag.fromMs === keyframeMs ? drag.toMs : keyframeMs;
          const current =
            playheadMs !== null && Math.abs(playheadMs - keyframeMs) <= 0.5;
          return (
            <button
              key={keyframeMs}
              type="button"
              css={diamondStyles(theme)}
              style={{ left: pct(shownMs) }}
              data-current={current}
              disabled={disabled}
              aria-label={t("i18n-cont-inspector-02.keyframes.keyframeAt", {
                property: propertyLabel,
                time: formatTimecode(clip.startMs + keyframeMs, fps)
              })}
              title={t("i18n-cont-inspector-02.keyframes.keyframeTooltip")}
              data-testid={`keyframe-diamond-${row.id}`}
              onPointerDown={(e) => handleDiamondPointerDown(e, keyframeMs)}
              onPointerMove={handleDiamondPointerMove}
              onPointerUp={handleDiamondPointerUp}
              onPointerCancel={() => setDrag(null)}
              onKeyDown={(e) => handleDiamondKeyDown(e, keyframeMs)}
              onClick={(e) => {
                // Pointer presses seek on pointerup; this is the keyboard path.
                if (e.detail === 0) onSeek(keyframeMs);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!disabled) setMenu({ x: e.clientX, y: e.clientY, atMs: keyframeMs });
              }}
            />
          );
        })}
        {menu && (
          <ContextMenu
            open
            position={menu}
            onClose={closeMenu}
            MenuListProps={{
              "aria-label": t("i18n-cont-inspector-02.keyframes.keyframeMenuLabel", {
                property: propertyLabel
              })
            }}
          >
            {easingOptions.map((option) => (
              <MenuItemPrimitive
                key={option.value}
                label={option.label}
                checkable="radio"
                checked={currentEasing === option.value}
                onClick={() => {
                  onEasing(menu.atMs, option.value);
                  closeMenu();
                }}
              />
            ))}
            <Divider />
            <MenuItemPrimitive
              label={t("i18n-cont-inspector-02.keyframes.deleteKeyframe")}
              onClick={() => {
                onDelete(menu.atMs);
                closeMenu();
              }}
            />
          </ContextMenu>
        )}
      </div>
    );
  }
);
KeyframeLane.displayName = "KeyframeLane";

interface InputProps {
  clip: TimelineClip;
  row: KeyframeRowSpec;
  input: KeyframeInputSpec;
  atMs: number;
  disabled: boolean;
  onCommit: (input: KeyframeInputSpec, value: number) => void;
}

const KeyframedInput: React.FC<InputProps> = memo(
  ({ clip, input, atMs, disabled, onCommit }) => {
    const { t } = useTranslation();
    const scale = input.displayScale ?? 1;
    const value = inputValueAt(clip, input, atMs) * scale;
    const handleCommit = useCallback(
      (raw: string) => {
        const n = parseFiniteNumber(raw);
        if (n !== null) onCommit(input, n / scale);
      },
      [input, onCommit, scale]
    );
    return (
      <InspectorPillInput
        value={value.toFixed(input.decimals)}
        unit={input.unit}
        minWidth={64}
        scrub={input.scrub}
        onCommit={handleCommit}
        disabled={disabled}
        ariaLabel={
          INPUT_LABEL_KEYS[input.ariaLabel]
            ? t(INPUT_LABEL_KEYS[input.ariaLabel])
            : input.ariaLabel
        }
      />
    );
  }
);
KeyframedInput.displayName = "KeyframedInput";

export interface KeyframedPropertyRowProps {
  clip: TimelineClip;
  row: KeyframeRowSpec;
  /** Locked clip or track: everything reads, nothing writes. */
  disabled?: boolean;
}

export const KeyframedPropertyRow: React.FC<KeyframedPropertyRowProps> = memo(
  ({ clip, row, disabled = false }) => {
    const { t } = useTranslation();
    const propertyLabelKey = ROW_LABEL_KEYS[row.id];
    const propertyLabel = propertyLabelKey ? t(propertyLabelKey) : row.label;
    const editClipKeyframes = useTimelineStore((s) => s.editClipKeyframes);
    const docApi = useTimelineStoreApi();
    const playbackApi = useTimelinePlaybackStoreApi();
    const fps = useTimelineStore((s) => s.fps);
    const seek = useTimelinePlaybackStore((s) => s.seek);
    const setKeyframeProperty = useTimelineUIStore((s) => s.setKeyframeProperty);
    const keyframed = isRowKeyframed(clip, row);
    const endMs = clip.startMs + clip.durationMs;
    const inside = useTimelinePlaybackStore(
      (s) => s.currentTimeMs >= clip.startMs && s.currentTimeMs <= endMs
    );
    // Only an animated row reads the playhead every frame; a static one only
    // needs to know whether it sits on the clip.
    const liveMs = useTimelinePlaybackStore((s) =>
      keyframed ? s.currentTimeMs : clip.startMs
    );
    const atMs = Math.max(0, Math.min(clip.durationMs, liveMs - clip.startMs));
    const clipId = clip.id;
    const startMs = clip.startMs;
    const durationMs = clip.durationMs;

    /** The playhead as a clip-relative time, read now, or null off the clip. */
    const playheadNow = useCallback((): number | null => {
      const now = playbackApi.getState().currentTimeMs;
      if (now < startMs || now > startMs + durationMs) return null;
      return Math.max(0, Math.min(durationMs, now - startMs));
    }, [playbackApi, startMs, durationMs]);

    const touch = useCallback(
      () => setKeyframeProperty(row.inputs[0].property),
      [row, setKeyframeProperty]
    );

    const handleCommit = useCallback(
      (input: KeyframeInputSpec, value: number) => {
        const at = playheadNow();
        editClipKeyframes(clipId, (c) => commitInputValue(c, row, input, value, at));
        touch();
      },
      [clipId, editClipKeyframes, playheadNow, row, touch]
    );

    const handleStopwatch = useCallback(() => {
      const at = playheadNow();
      editClipKeyframes(clipId, (c) => toggleRowStopwatch(c, row, at));
      touch();
    }, [clipId, editClipKeyframes, playheadNow, row, touch]);

    const handleToggleKey = useCallback(() => {
      const at = playheadNow();
      editClipKeyframes(clipId, (c) => toggleRowKeyframeAt(c, row, at));
      touch();
    }, [clipId, editClipKeyframes, playheadNow, row, touch]);

    const handleSeek = useCallback(
      (relMs: number) => seek(startMs + relMs),
      [seek, startMs]
    );

    const handleStep = useCallback(
      (direction: 1 | -1) => {
        const now = playbackApi.getState().currentTimeMs;
        const c = docApi.getState().clips.find((x) => x.id === clipId);
        if (!c) return;
        const t = adjacentKeyframeMs(c, rowProperties(row), now - c.startMs, direction);
        if (t !== null) seek(c.startMs + t);
      },
      [clipId, docApi, playbackApi, row, seek]
    );
    const handlePrev = useCallback(() => handleStep(-1), [handleStep]);
    const handleNext = useCallback(() => handleStep(1), [handleStep]);

    const handleMove = useCallback(
      (fromMs: number, toMs: number) => {
        editClipKeyframes(clipId, (c) => ({
          animations: moveKeyframes(c, rowProperties(row), fromMs, toMs)
        }));
      },
      [clipId, editClipKeyframes, row]
    );
    const handleEasing = useCallback(
      (at: number, easing: string) => {
        editClipKeyframes(clipId, (c) => ({
          animations: setKeyframeEasing(c, rowProperties(row), at, easing)
        }));
      },
      [clipId, editClipKeyframes, row]
    );
    const handleDelete = useCallback(
      (at: number) => {
        editClipKeyframes(clipId, (c) =>
          rowHasKeyframeAt(c, row, at) ? toggleRowKeyframeAt(c, row, at) : null
        );
      },
      [clipId, editClipKeyframes, row]
    );

    const times = keyframed ? rowKeyframeTimesMs(clip, row) : [];
    const hasPrev = times.some((t) => t < atMs - 0.5);
    const hasNext = times.some((t) => t > atMs + 0.5);
    const keyedHere = keyframed && inside && rowHasKeyframeAt(clip, row, atMs);
    // Off the clip, a keyed row has no instant to write to.
    const fieldDisabled = disabled || (keyframed && !inside);

    return (
      <>
        <InspectorRow
          label={
            <FlexRow align="center" gap={SPACING.xs}>
              <StateIconButton
                size="small"
                onClick={handleStopwatch}
                isActive={keyframed}
                disabled={disabled || !inside}
                icon={<TimerOutlinedIcon fontSize="inherit" />}
                activeIcon={<TimerIcon fontSize="inherit" />}
                tooltip={
                  !inside
                    ? t("i18n-cont-inspector-02.keyframes.movePlayheadToAnimate")
                    : keyframed
                      ? t("i18n-cont-inspector-02.keyframes.stopAnimatingTooltip", {
                          property: propertyLabel
                        })
                      : t("i18n-cont-inspector-02.keyframes.animateTooltip", {
                          property: propertyLabel
                        })
                }
                ariaLabel={t(
                  keyframed
                    ? "i18n-cont-inspector-02.keyframes.stopAnimatingLabel"
                    : "i18n-cont-inspector-02.keyframes.animateLabel",
                  { property: propertyLabel }
                )}
              />
              <span>{propertyLabel}</span>
            </FlexRow>
          }
        >
          {row.inputs.map((input) => (
            <KeyframedInput
              key={input.ariaLabel}
              clip={clip}
              row={row}
              input={input}
              atMs={atMs}
              disabled={fieldDisabled}
              onCommit={handleCommit}
            />
          ))}
        </InspectorRow>
        {keyframed && (
          <FlexRow
            align="center"
            gap={SPACING.xs}
            sx={{ px: SPACING.xs, pb: SPACING.xs }}
            data-testid={`keyframe-row-${row.id}`}
          >
            <KeyframeLane
              clip={clip}
              row={row}
              playheadMs={inside ? atMs : null}
              fps={fps}
              disabled={disabled}
              onSeek={handleSeek}
              onMove={handleMove}
              onEasing={handleEasing}
              onDelete={handleDelete}
            />
            <ToolbarIconButton
              size="small"
              icon={<ChevronLeftIcon fontSize="inherit" />}
              tooltip={t("i18n-cont-inspector-02.keyframes.previousKeyframe")}
              onClick={handlePrev}
              disabled={!hasPrev}
            />
            <StateIconButton
              size="small"
              onClick={handleToggleKey}
              isActive={keyedHere}
              disabled={disabled || !inside}
              icon={<DiamondOutlinedIcon fontSize="inherit" />}
              activeIcon={<DiamondIcon fontSize="inherit" />}
              tooltip={t(
                keyedHere
                  ? "i18n-cont-inspector-02.keyframes.deleteAtPlayhead"
                  : "i18n-cont-inspector-02.keyframes.addAtPlayhead"
              )}
              ariaLabel={t(
                keyedHere
                  ? "i18n-cont-inspector-02.keyframes.deletePropertyKeyframe"
                  : "i18n-cont-inspector-02.keyframes.addPropertyKeyframe",
                { property: propertyLabel }
              )}
            />
            <ToolbarIconButton
              size="small"
              icon={<ChevronRightIcon fontSize="inherit" />}
              tooltip={t("i18n-cont-inspector-02.keyframes.nextKeyframe")}
              onClick={handleNext}
              disabled={!hasNext}
            />
          </FlexRow>
        )}
      </>
    );
  }
);
KeyframedPropertyRow.displayName = "KeyframedPropertyRow";
