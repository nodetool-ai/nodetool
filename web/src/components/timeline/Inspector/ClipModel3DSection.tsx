/**
 * 3D section: everything `ClipModel3DStyle` carries (design §D7).
 *
 * The camera splits the section in two — `orbit` frames the model's bounding
 * sphere from the four orbit terms, `scene` uses a camera the glTF declares —
 * so the fields that mean nothing in the current mode are not rendered rather
 * than shown greyed out, the way the shape section renders per kind.
 *
 * The camera and animation pickers are filled from the render session, so they
 * only ever offer names the model actually has; until it loads they say so
 * (R4). Every edit goes through `model3dStyleWithPatch`, so changing one orbit
 * term keeps the other three.
 */

import React, { memo, useCallback, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import type {
  ClipModel3DStyle,
  ClipModel3DStylePatch,
  Model3DCameraMode,
  TimelineClip
} from "@nodetool-ai/timeline";
import {
  computeModel3DBakeHash,
  model3dStyleWithPatch,
  TRANSPARENT_BAKE_REFUSAL
} from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import {
  Button,
  Caption,
  Chip,
  CollapsibleSection,
  FlexColumn,
  LoadingSpinner,
  SPACING,
  TextInput
} from "../../ui_primitives";
import { useModel3DBake } from "../../../hooks/timeline/useModel3DBake";
import { usePersistedFold } from "./usePersistedFold";
import {
  InspectorDivider,
  InspectorPillInput,
  InspectorRow,
  InspectorSectionTitle,
  InspectorSelect,
  InspectorSliderRow,
  InspectorStaticValue,
  InspectorToggleRow
} from "./InspectorPrimitives";
import {
  useModel3DSessionNames,
  type Model3DSessionNames
} from "./useModel3DSessionNames";

const CAMERA_MODES = [
  { value: "orbit", label: "Orbit" },
  { value: "scene", label: "Scene camera" }
] as const;

const LIGHTING_PRESETS = [
  { value: "studio", label: "Studio" },
  { value: "soft", label: "Soft" },
  { value: "flat", label: "Flat" }
] as const;

/** The picker value that means "whatever the glTF lists first / all of them". */
const AUTO = "";

const SCRUB_DEGREES = { step: 1 };
const SCRUB_ZOOM = { step: 0.01, min: 0.05 };
const SCRUB_FOV = { step: 1, min: 1, max: 170 };
const SCRUB_SPEED = { step: 0.01, min: 0.05, max: 8 };

const BACKGROUND_COLOR_INPUT_PROPS = { "aria-label": "Background color" };

/**
 * What an opaque background starts at. Scene content, not chrome: it is the
 * colour three.js and Blender clear the frame to, and it matches
 * `nodetool.model3d.RenderToImage`'s own default, so a theme token would be
 * the wrong thing to reach for here.
 */
const DEFAULT_BACKGROUND_COLOR = "#ffffff";

/**
 * The button's label while a bake runs. It cancels while it runs, so the
 * label says what pressing it does as well as how far along the render is —
 * the frame counter arrives with the op's first rendered still.
 */
function bakeProgressLabel(
  progress: { done: number; total: number } | null
): string {
  if (!progress || progress.total <= 0) return "Cancel bake";
  return `Cancel (${progress.done}/${progress.total})`;
}


export interface ClipModel3DSectionProps {
  clip: TimelineClip;
  model3dStyle: ClipModel3DStyle;
}

export const ClipModel3DSection: React.FC<ClipModel3DSectionProps> = memo(
  ({ clip, model3dStyle }) => {
    const patchClip = useTimelineStore((s) => s.patchClip);
    const [open, setOpen] = usePersistedFold("model3d");

    const styleRef = useRef(model3dStyle);
    styleRef.current = model3dStyle;
    const clipIdRef = useRef(clip.id);
    clipIdRef.current = clip.id;

    const names = useModel3DSessionNames(clip, model3dStyle);

    const bake = useModel3DBake();
    const baking = bake.state.clipId === clip.id;
    const sequence = useTimelineStore(
      useShallow((s) => ({ fps: s.fps, width: s.width, height: s.height }))
    );
    /**
     * The same comparison `validate_timeline` reports as `bake_stale`: a bake
     * whose hash no longer names this clip's picture is not played, so the row
     * says why the canvas is showing the live proxy again.
     */
    const stale =
      model3dStyle.bake !== undefined &&
      computeModel3DBakeHash(clip, sequence) !==
        model3dStyle.bake.dependencyHash;
    const handleBake = useCallback(() => {
      // The hook already holds the failure on its own state for the row below.
      void bake.bakeClip(clipIdRef.current).catch(() => {});
    }, [bake]);

    const patchStyle = useCallback(
      (patch: ClipModel3DStylePatch) => {
        patchClip(clipIdRef.current, {
          model3dStyle: model3dStyleWithPatch(styleRef.current, patch)
        });
      },
      [patchClip]
    );

    // A stable callback per field, so an edit re-renders only the control whose
    // value changed rather than every memoized row in the section.
    const handleModeChange = useCallback(
      (value: string) =>
        patchStyle({ camera: { mode: value as Model3DCameraMode } }),
      [patchStyle]
    );
    const handleAzimuthCommit = useCallback(
      (raw: string) =>
        commitNumber(raw, (azimuthDeg) => patchStyle({ camera: { azimuthDeg } })),
      [patchStyle]
    );
    const handleElevationCommit = useCallback(
      (raw: string) =>
        commitNumber(raw, (elevationDeg) =>
          patchStyle({ camera: { elevationDeg } })
        ),
      [patchStyle]
    );
    const handleFovCommit = useCallback(
      (raw: string) =>
        commitNumber(raw, (fovDeg) => patchStyle({ camera: { fovDeg } })),
      [patchStyle]
    );
    const handleZoomCommit = useCallback(
      (raw: string) =>
        commitNumber(raw, (zoom) => patchStyle({ camera: { zoom } })),
      [patchStyle]
    );
    const handleSceneCameraChange = useCallback(
      (value: string) =>
        patchStyle({
          camera: { sceneCameraName: value === AUTO ? undefined : value }
        }),
      [patchStyle]
    );
    const handleAnimationChange = useCallback(
      (value: string) =>
        patchStyle({
          animation: { clipName: value === AUTO ? undefined : value }
        }),
      [patchStyle]
    );
    const handleLoopChange = useCallback(
      (loop: boolean) => patchStyle({ animation: { loop } }),
      [patchStyle]
    );
    const handleSpeedCommit = useCallback(
      (raw: string) =>
        commitNumber(raw, (speed) => patchStyle({ animation: { speed } })),
      [patchStyle]
    );
    const handleLightingChange = useCallback(
      (value: string) =>
        patchStyle({ lighting: value as ClipModel3DStyle["lighting"] }),
      [patchStyle]
    );
    const handleIntensityChange = useCallback(
      (lightIntensity: number) => patchStyle({ lightIntensity }),
      [patchStyle]
    );
    // The background is a union, not a bag of fields: turning transparency off
    // has to name a colour, and turning it on has to drop the one it had.
    const handleTransparentChange = useCallback(
      (transparent: boolean) =>
        patchStyle({
          background: transparent
            ? { transparent: true }
            : { transparent: false, color: DEFAULT_BACKGROUND_COLOR }
        }),
      [patchStyle]
    );
    const handleBackgroundColorChange = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) =>
        patchStyle({
          background: { transparent: false, color: event.target.value }
        }),
      [patchStyle]
    );

    const camera = model3dStyle.camera;
    const background = model3dStyle.background;

    return (
      <>
        <CollapsibleSection
          title={
            <InspectorSectionTitle
              title="3D Model"
              icon={<ViewInArOutlinedIcon />}
            />
          }
          open={open}
          onToggle={setOpen}
          unmountOnExit
        >
          <FlexColumn gap={SPACING.xs} sx={{ py: SPACING.xs }}>
            <InspectorRow label="Camera">
              <InspectorSelect
                label="Camera mode"
                value={camera.mode}
                options={CAMERA_MODES}
                onChange={handleModeChange}
              />
            </InspectorRow>

            {camera.mode === "orbit" && (
              <>
                <InspectorRow label="Orbit">
                  <InspectorPillInput
                    value={camera.azimuthDeg.toFixed(1)}
                    unit="°"
                    minWidth={64}
                    scrub={SCRUB_DEGREES}
                    onCommit={handleAzimuthCommit}
                    ariaLabel="Camera azimuth"
                  />
                  <InspectorPillInput
                    value={camera.elevationDeg.toFixed(1)}
                    unit="°"
                    minWidth={64}
                    scrub={SCRUB_DEGREES}
                    onCommit={handleElevationCommit}
                    ariaLabel="Camera elevation"
                  />
                </InspectorRow>
                <InspectorRow label="Lens">
                  <InspectorPillInput
                    value={camera.fovDeg.toFixed(1)}
                    unit="°"
                    minWidth={64}
                    scrub={SCRUB_FOV}
                    onCommit={handleFovCommit}
                    ariaLabel="Camera field of view"
                  />
                  <InspectorPillInput
                    value={camera.zoom.toFixed(2)}
                    unit="×"
                    minWidth={64}
                    scrub={SCRUB_ZOOM}
                    onCommit={handleZoomCommit}
                    ariaLabel="Camera zoom"
                  />
                </InspectorRow>
              </>
            )}

            {camera.mode === "scene" && (
              <NamePickerRow
                label="Scene camera"
                pickerLabel="Scene camera"
                autoLabel="First camera"
                value={camera.sceneCameraName ?? AUTO}
                names={names.cameras}
                session={names}
                onChange={handleSceneCameraChange}
              />
            )}

            <NamePickerRow
              label="Animation"
              pickerLabel="glTF animation"
              autoLabel="All animations"
              value={model3dStyle.animation.clipName ?? AUTO}
              names={names.animations}
              session={names}
              onChange={handleAnimationChange}
            />
            <InspectorToggleRow
              label="Loop"
              checked={model3dStyle.animation.loop}
              onChange={handleLoopChange}
            />
            <InspectorRow label="Animation speed">
              <InspectorPillInput
                value={model3dStyle.animation.speed.toFixed(2)}
                unit="×"
                scrub={SCRUB_SPEED}
                onCommit={handleSpeedCommit}
                ariaLabel="Animation speed"
              />
            </InspectorRow>

            <InspectorRow label="Lighting">
              <InspectorSelect
                label="Lighting preset"
                value={model3dStyle.lighting}
                options={LIGHTING_PRESETS}
                onChange={handleLightingChange}
              />
            </InspectorRow>
            <InspectorSliderRow
              label="Light intensity"
              min={0}
              max={4}
              step={0.05}
              value={model3dStyle.lightIntensity}
              display={model3dStyle.lightIntensity.toFixed(2)}
              onChange={handleIntensityChange}
            />

            <InspectorToggleRow
              label="Transparent background"
              checked={background.transparent}
              onChange={handleTransparentChange}
            />
            {!background.transparent && (
              <InspectorRow label="Background color">
                <TextInput
                  type="color"
                  value={background.color}
                  onChange={handleBackgroundColorChange}
                  inputProps={BACKGROUND_COLOR_INPUT_PROPS}
                />
              </InspectorRow>
            )}

            <InspectorRow label="Bake">
              <FlexColumn gap={SPACING.xs}>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={!baking && background.transparent}
                  onClick={baking ? bake.cancel : handleBake}
                  startIcon={
                    baking ? <LoadingSpinner inline size={14} /> : undefined
                  }
                >
                  {baking
                    ? bakeProgressLabel(bake.state.progress)
                    : "Bake with Blender"}
                </Button>
                {stale && (
                  <Chip
                    compact
                    color="warning"
                    label="Stale — the clip changed since this bake"
                  />
                )}
              </FlexColumn>
            </InspectorRow>
            <Caption color="muted">
              A bake is the intended look: Blender renders this clip and the
              clip plays that video. What you see on the canvas now is the live
              proxy, and its lighting is close, not identical.
            </Caption>
            {background.transparent && (
              <Caption color="muted">{TRANSPARENT_BAKE_REFUSAL}</Caption>
            )}
            {bake.state.error && (
              <Caption color="error">{bake.state.error}</Caption>
            )}
          </FlexColumn>
        </CollapsibleSection>
        <InspectorDivider />
      </>
    );
  }
);

interface NamePickerRowProps {
  /** The row's visible label. */
  label: string;
  /** The picker's accessible name. */
  pickerLabel: string;
  /** What the empty value means for this picker. */
  autoLabel: string;
  value: string;
  names: readonly string[];
  /** The load state the names came from — loading and failure are rows too. */
  session: Model3DSessionNames;
  onChange: (value: string) => void;
}

/**
 * A picker over names the render session read out of the glTF. The model loads
 * asynchronously, so the row says what it is waiting for instead of offering an
 * empty list (R4), and says why when the model will not load at all.
 */
const NamePickerRow: React.FC<NamePickerRowProps> = memo(
  ({ label, pickerLabel, autoLabel, value, names, session, onChange }) => {
    if (session.status === "loading") {
      return (
        <InspectorRow label={label}>
          <InspectorStaticValue value="Loading model…" />
        </InspectorRow>
      );
    }
    if (session.status === "unavailable") {
      return (
        <InspectorRow label={label}>
          <InspectorStaticValue value={session.message ?? "Unavailable"} />
        </InspectorRow>
      );
    }
    // A name the clip already carries but the model no longer has stays in the
    // list, so the picker shows what is stored rather than silently snapping to
    // the default.
    const options = [
      { value: AUTO, label: autoLabel },
      ...names.map((name) => ({ value: name, label: name })),
      ...(value !== AUTO && !names.includes(value)
        ? [{ value, label: `${value} (missing)` }]
        : [])
    ];
    return (
      <InspectorRow label={label}>
        <InspectorSelect
          label={pickerLabel}
          value={value}
          options={options}
          onChange={onChange}
          grow
        />
      </InspectorRow>
    );
  }
);
NamePickerRow.displayName = "NamePickerRow";

/** Commit a numeric field, ignoring anything that does not parse. */
function commitNumber(raw: string, apply: (value: number) => void): void {
  const value = Number(raw);
  if (Number.isFinite(value)) apply(value);
}

ClipModel3DSection.displayName = "ClipModel3DSection";
