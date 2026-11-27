/**
 * Model3DCameraMoveMenu: the popover that adds a camera move to a `model3d`
 * clip's free camera.
 *
 * The user picks one of `MODEL3D_CAMERA_MOVES`, an amount in the move's unit
 * and a duration. The move starts at the playhead and by default runs to the
 * end of the clip. Applying it writes the move's keyframes through
 * `applyModel3DCameraMove` in one `editClipKeyframes` call, so it is one undo
 * entry.
 */

import React, { memo, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MODEL3D_CAMERA_MOVES,
  applyModel3DCameraMove,
  model3dCameraMoveSpec,
  type Model3DCameraMoveId,
  type Model3DCameraMoveUnit,
  type TimelineClip
} from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStoreApi } from "../../../stores/timeline/TimelineInstance";
import {
  Button,
  Caption,
  FlexColumn,
  FlexRow,
  InspectorValueInput,
  PADDING,
  Popover,
  SPACING,
  Text
} from "../../ui_primitives";
import { InspectorRow, InspectorSelect } from "./InspectorPrimitives";
import {
  formatTimecode,
  parseFiniteNumber
} from "./InspectorPrimitives.helpers";
import { cameraMoveAmountDisplay, cameraMoveSpan } from "./model3dFreeCamera";

const MOVE_LABEL_KEYS: Record<Model3DCameraMoveId, string> = {
  pan: "pass3_25.timeline.inspector.model3d.moves.pan",
  tilt: "pass3_25.timeline.inspector.model3d.moves.tilt",
  orbit: "pass3_25.timeline.inspector.model3d.moves.orbit",
  pushIn: "pass3_25.timeline.inspector.model3d.moves.pushIn",
  truck: "pass3_25.timeline.inspector.model3d.moves.truck",
  crane: "pass3_25.timeline.inspector.model3d.moves.crane",
  pedestal: "pass3_25.timeline.inspector.model3d.moves.pedestal",
  zoom: "pass3_25.timeline.inspector.model3d.moves.zoom",
  dollyZoom: "pass3_25.timeline.inspector.model3d.moves.dollyZoom",
  dutch: "pass3_25.timeline.inspector.model3d.moves.dutch"
};

const AMOUNT_HELP_KEYS: Record<Model3DCameraMoveUnit, string> = {
  degrees: "pass3_25.timeline.inspector.model3d.moveAmountDegrees",
  distance: "pass3_25.timeline.inspector.model3d.moveAmountDistance",
  factor: "pass3_25.timeline.inspector.model3d.moveAmountFactor"
};

/** The shortest move the menu applies, so a move always has two instants. */
const MIN_MOVE_MS = 40;

/** The popover's width in theme spacing units. */
const MENU_WIDTH = 72;

export interface Model3DCameraMoveMenuProps {
  clip: TimelineClip;
  /** The button the popover hangs from. Null keeps it closed. */
  anchorEl: HTMLElement | null;
  onClose: () => void;
}

export const Model3DCameraMoveMenu: React.FC<Model3DCameraMoveMenuProps> = memo(
  ({ clip, anchorEl, onClose }) => {
    const { t } = useTranslation();
    const editClipKeyframes = useTimelineStore((s) => s.editClipKeyframes);
    const fps = useTimelineStore((s) => s.fps);
    const playbackApi = useTimelinePlaybackStoreApi();

    const [moveId, setMoveId] = useState<Model3DCameraMoveId>("pushIn");
    const [amount, setAmount] = useState(
      () => model3dCameraMoveSpec("pushIn").defaultAmount
    );
    const [span, setSpan] = useState(() => cameraMoveSpan(clip, null));

    // The span is read when the menu opens: the move starts where the playhead
    // was when the user asked for it.
    const open = Boolean(anchorEl);
    useEffect(() => {
      if (!open) {
        return;
      }
      const now = playbackApi.getState().currentTimeMs - clip.startMs;
      setSpan(
        cameraMoveSpan(clip, now < 0 || now > clip.durationMs ? null : now)
      );
      // Read once per open. Re-reading on every clip edit would reset a
      // duration the user has typed.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const spec = model3dCameraMoveSpec(moveId);
    const display = cameraMoveAmountDisplay(spec.unit);
    const maxDurationMs = clip.durationMs - span.startMs;

    const handleMoveChange = useCallback((value: string) => {
      const next = value as Model3DCameraMoveId;
      setMoveId(next);
      setAmount(model3dCameraMoveSpec(next).defaultAmount);
    }, []);

    const handleAmountCommit = useCallback(
      (raw: string) => {
        const value = parseFiniteNumber(raw);
        if (value !== null) {
          setAmount(value / display.scale);
        }
      },
      [display.scale]
    );

    const handleDurationCommit = useCallback(
      (raw: string) => {
        const seconds = parseFiniteNumber(raw);
        if (seconds === null) {
          return;
        }
        setSpan((current) => ({
          ...current,
          durationMs: Math.min(
            Math.max(seconds * 1000, MIN_MOVE_MS),
            clip.durationMs - current.startMs
          )
        }));
      },
      [clip.durationMs]
    );

    const handleApply = useCallback(() => {
      editClipKeyframes(clip.id, (current) => ({
        animations: applyModel3DCameraMove(current, moveId, {
          startMs: span.startMs,
          durationMs: span.durationMs,
          amount
        })
      }));
      onClose();
    }, [amount, clip.id, editClipKeyframes, moveId, onClose, span]);

    const moveOptions = MODEL3D_CAMERA_MOVES.map((move) => ({
      value: move.id,
      label: t(MOVE_LABEL_KEYS[move.id])
    }));

    return (
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={onClose}
        placement="bottom-left"
      >
        <FlexColumn
          gap={SPACING.sm}
          sx={{ width: (theme) => theme.spacing(MENU_WIDTH), p: PADDING.comfortable }}
          data-testid="model3d-camera-move-menu"
        >
          <Text size="small" weight={600}>
            {t("pass3_25.timeline.inspector.model3d.addCameraMove")}
          </Text>
          <InspectorRow label={t("pass3_25.timeline.inspector.model3d.move")}>
            <InspectorSelect
              label={t("pass3_25.timeline.inspector.model3d.move")}
              value={moveId}
              options={moveOptions}
              onChange={handleMoveChange}
              grow
            />
          </InspectorRow>
          <InspectorRow
            label={t("pass3_25.timeline.inspector.model3d.moveAmount")}
          >
            <InspectorValueInput
              value={(amount * display.scale).toFixed(display.decimals)}
              unit={display.unit}
              scrub={{ step: display.step }}
              onCommit={handleAmountCommit}
              ariaLabel={t("pass3_25.timeline.inspector.model3d.moveAmount")}
            />
          </InspectorRow>
          <InspectorRow
            label={t("pass3_25.timeline.inspector.model3d.moveDuration")}
          >
            <InspectorValueInput
              value={(span.durationMs / 1000).toFixed(2)}
              unit="s"
              scrub={{
                step: 0.1,
                min: MIN_MOVE_MS / 1000,
                max: maxDurationMs / 1000
              }}
              onCommit={handleDurationCommit}
              ariaLabel={t("pass3_25.timeline.inspector.model3d.moveDuration")}
            />
          </InspectorRow>
          <Caption color="muted">
            {t(AMOUNT_HELP_KEYS[spec.unit])}{" "}
            {t("pass3_25.timeline.inspector.model3d.moveStartsAt", {
              time: formatTimecode(clip.startMs + span.startMs, fps)
            })}
          </Caption>
          <FlexRow justify="flex-end" gap={SPACING.sm}>
            <Button size="small" variant="text" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={handleApply}
              disabled={maxDurationMs < MIN_MOVE_MS}
              data-testid="model3d-camera-move-apply"
            >
              {t("pass3_25.timeline.inspector.model3d.applyMove")}
            </Button>
          </FlexRow>
        </FlexColumn>
      </Popover>
    );
  }
);

Model3DCameraMoveMenu.displayName = "Model3DCameraMoveMenu";
