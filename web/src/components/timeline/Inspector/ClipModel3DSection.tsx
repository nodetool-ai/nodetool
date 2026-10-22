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
import { useTranslation } from "react-i18next";
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
  model3dStyleWithPatch
} from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import ErrorBanner from "../../support/ErrorBanner";
import {
  Button,
  ButtonSpinner,
  Caption,
  Chip,
  CollapsibleSection,
  FlexColumn,
  SPACING,
  BatchedColorInput
} from "../../ui_primitives";
import { useModel3DBake } from "../../../hooks/timeline/useModel3DBake";
import { usePersistedFold } from "./usePersistedFold";
import { KeyframedPropertyRow } from "./KeyframedPropertyRow";
import {
  CAMERA_FOV_ROW,
  CAMERA_ORBIT_ROW,
  CAMERA_ZOOM_ROW
} from "./keyframeRows";
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
import { parseFiniteNumber } from "./InspectorPrimitives.helpers";
import {
  useModel3DSessionNames,
  type Model3DSessionNames
} from "./useModel3DSessionNames";

/** The picker value that means "whatever the glTF lists first / all of them". */
const AUTO = "";

const SCRUB_SPEED = { step: 0.01, min: 0.05, max: 8 };

/**
 * What an opaque background starts at. Scene content, not chrome: it is the
 * colour three.js and Blender clear the frame to, and it matches
 * `nodetool.model3d.RenderToImage`'s own default, so a theme token would be
 * the wrong thing to reach for here.
 */
const DEFAULT_BACKGROUND_COLOR = "#ffffff";

export interface ClipModel3DSectionProps {
  clip: TimelineClip;
  model3dStyle: ClipModel3DStyle;
}

export const ClipModel3DSection: React.FC<ClipModel3DSectionProps> = memo(
  ({ clip, model3dStyle }) => {
    const { t } = useTranslation();
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
      (color: string) =>
        patchStyle({ background: { transparent: false, color } }),
      [patchStyle]
    );

    const camera = model3dStyle.camera;
    const background = model3dStyle.background;
    const cameraModes = [
      { value: "orbit", label: t("pass3_25.timeline.inspector.model3d.orbit") },
      {
        value: "scene",
        label: t("pass3_25.timeline.inspector.model3d.sceneCamera")
      }
    ] as const;
    const lightingPresets = [
      {
        value: "studio",
        label: t("pass3_25.timeline.inspector.model3d.studio")
      },
      { value: "soft", label: t("pass3_25.timeline.inspector.model3d.soft") },
      { value: "flat", label: t("pass3_25.timeline.inspector.model3d.flat") }
    ] as const;

    return (
      <>
        <CollapsibleSection
          title={
            <InspectorSectionTitle
              title={t("pass3_25.timeline.inspector.model3d.title")}
              icon={<ViewInArOutlinedIcon />}
            />
          }
          open={open}
          onToggle={setOpen}
          unmountOnExit
        >
          <FlexColumn gap={SPACING.xs} sx={{ py: SPACING.xs }}>
            <InspectorRow
              label={t("pass3_25.timeline.inspector.model3d.camera")}
            >
              <InspectorSelect
                label={t("pass3_25.timeline.inspector.model3d.cameraMode")}
                value={camera.mode}
                options={cameraModes}
                onChange={handleModeChange}
              />
            </InspectorRow>

            {camera.mode === "orbit" && (
              <>
                <KeyframedPropertyRow clip={clip} row={CAMERA_ORBIT_ROW} />
                <KeyframedPropertyRow clip={clip} row={CAMERA_FOV_ROW} />
                <KeyframedPropertyRow clip={clip} row={CAMERA_ZOOM_ROW} />
              </>
            )}

            {camera.mode === "scene" && (
              <NamePickerRow
                label={t("pass3_25.timeline.inspector.model3d.sceneCamera")}
                pickerLabel={t(
                  "pass3_25.timeline.inspector.model3d.sceneCamera"
                )}
                autoLabel={t("pass3_25.timeline.inspector.model3d.firstCamera")}
                value={camera.sceneCameraName ?? AUTO}
                names={names.cameras}
                session={names}
                onChange={handleSceneCameraChange}
              />
            )}

            <NamePickerRow
              label={t("pass3_25.timeline.inspector.model3d.animation")}
              pickerLabel={t(
                "pass3_25.timeline.inspector.model3d.gltfAnimation"
              )}
              autoLabel={t("pass3_25.timeline.inspector.model3d.allAnimations")}
              value={model3dStyle.animation.clipName ?? AUTO}
              names={names.animations}
              session={names}
              onChange={handleAnimationChange}
            />
            <InspectorToggleRow
              label={t("pass3_25.timeline.inspector.model3d.loop")}
              checked={model3dStyle.animation.loop}
              onChange={handleLoopChange}
            />
            <InspectorRow
              label={t("pass3_25.timeline.inspector.model3d.animationSpeed")}
            >
              <InspectorPillInput
                value={model3dStyle.animation.speed.toFixed(2)}
                unit="×"
                scrub={SCRUB_SPEED}
                onCommit={handleSpeedCommit}
                ariaLabel={t(
                  "pass3_25.timeline.inspector.model3d.animationSpeed"
                )}
              />
            </InspectorRow>

            <InspectorRow
              label={t("pass3_25.timeline.inspector.model3d.lighting")}
            >
              <InspectorSelect
                label={t("pass3_25.timeline.inspector.model3d.lightingPreset")}
                value={model3dStyle.lighting}
                options={lightingPresets}
                onChange={handleLightingChange}
              />
            </InspectorRow>
            <InspectorSliderRow
              label={t("pass3_25.timeline.inspector.model3d.lightIntensity")}
              min={0}
              max={4}
              step={0.05}
              value={model3dStyle.lightIntensity}
              display={model3dStyle.lightIntensity.toFixed(2)}
              onChange={handleIntensityChange}
            />

            <InspectorToggleRow
              label={t(
                "pass3_25.timeline.inspector.model3d.transparentBackground"
              )}
              checked={background.transparent}
              onChange={handleTransparentChange}
            />
            {!background.transparent && (
              <InspectorRow
                label={t("pass3_25.timeline.inspector.model3d.backgroundColor")}
              >
                <BatchedColorInput
                  value={background.color}
                  onChange={handleBackgroundColorChange}
                  ariaLabel={t(
                    "pass3_25.timeline.inspector.model3d.backgroundColor"
                  )}
                />
              </InspectorRow>
            )}

            <InspectorRow label={t("pass3_25.timeline.inspector.model3d.bake")}>
              <FlexColumn gap={SPACING.xs}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={baking ? bake.cancel : handleBake}
                  // Baking turns the button into Cancel, so it stays enabled.
                  startIcon={baking ? <ButtonSpinner /> : undefined}
                >
                  {baking
                    ? !bake.state.progress || bake.state.progress.total <= 0
                      ? t("pass3_25.timeline.inspector.model3d.cancelBake")
                      : t(
                          "pass3_25.timeline.inspector.model3d.cancelBakeProgress",
                          bake.state.progress
                        )
                    : t("pass3_25.timeline.inspector.model3d.bakeWithBlender")}
                </Button>
                {stale && (
                  <Chip
                    compact
                    color="warning"
                    label={t("pass3_25.timeline.inspector.model3d.staleBake")}
                  />
                )}
              </FlexColumn>
            </InspectorRow>
            <Caption color="muted">
              {t("pass3_25.timeline.inspector.model3d.bakeHelp")}
            </Caption>
            {bake.state.error && (
              <ErrorBanner
                report={{
                  source: "operation-failure",
                  summary: t("pass3_25.timeline.inspector.model3d.bakeFailed"),
                  errorText: bake.state.error
                }}
              >
                {bake.state.error}
              </ErrorBanner>
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
    const { t } = useTranslation();
    if (session.status === "loading") {
      return (
        <InspectorRow label={label}>
          <InspectorStaticValue
            value={t("pass3_25.timeline.inspector.model3d.loadingModel")}
          />
        </InspectorRow>
      );
    }
    if (session.status === "unavailable") {
      return (
        <InspectorRow label={label}>
          <InspectorStaticValue
            value={
              session.message ??
              t("pass3_25.timeline.inspector.model3d.unavailable")
            }
          />
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
        ? [
            {
              value,
              label: t("pass3_25.timeline.inspector.model3d.missingName", {
                name: value
              })
            }
          ]
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

/** Commit a numeric field, ignoring blank, non-numeric or out-of-range input. */
function commitNumber(
  raw: string,
  apply: (value: number) => void,
  min?: number,
  exclusiveMin = false
): void {
  const value = parseFiniteNumber(raw);
  if (value === null) return;
  if (min !== undefined && (exclusiveMin ? value <= min : value < min)) return;
  apply(value);
}

ClipModel3DSection.displayName = "ClipModel3DSection";
