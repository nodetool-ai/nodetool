/** @jsxImportSource @emotion/react */

/**
 * Model3DOrbitOverlay — the preview's camera gestures for a selected `model3d`
 * clip (design §D7 "Preview"). On an orbit camera, Alt-drag turns
 * `model3dStyle.camera` in azimuth and elevation and Alt-wheel dollies its
 * zoom. On a free camera, Alt-drag turns the eye around the target,
 * Alt+Shift-drag trucks the eye and the target together in the view plane,
 * Alt-wheel dollies toward the target and Alt+Ctrl-wheel changes the lens. A
 * readout names the pose while the gesture runs.
 *
 * A free camera with keys on its channels takes the gesture as a keyframe at
 * the playhead. One without keys takes it as its authored pose
 * (`freeCameraPosePatch`).
 *
 * One undo entry per gesture. The pointer gesture writes `patchClip` once, on
 * pointer up, so a drag is a single document edit rather than one per
 * pointermove; the in-flight pose lives in component state until then and
 * reaches the host through `onPreviewCamera`, which is how the picture keeps up
 * without the document being touched two hundred times. A wheel burst has no
 * pointer up, so its commit trails the last notch by
 * {@link WHEEL_COMMIT_IDLE_MS}.
 *
 * Alt is the whole gate, and the overlay is never a hit target: it renders
 * `pointer-events: none` and listens on its host element in the capture phase,
 * returning immediately unless `altKey` is down. The 2D transform gizmo's
 * drags, clicks and context menu therefore reach it exactly as before, and a
 * clip that is not `model3d` renders nothing at all.
 *
 * The camera terms come from `model3dOrbitGesture.ts` and
 * `model3dFreeCameraGesture.ts`. The orbit write path is the inspector's
 * (`ClipModel3DSection`): `model3dStyleWithPatch` over the clip's current
 * style, through `patchClip`. The free write path is
 * `Inspector/model3dFreeCamera.ts`, through `editClipKeyframes`.
 *
 * @module timeline/preview/Model3DOrbitOverlay
 */

import React, { memo, useEffect, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import type {
  ClipModel3DCamera,
  ClipModel3DStyle,
  Model3DFreeCameraPose,
  TimelineClip
} from "@nodetool-ai/timeline";
import {
  DEFAULT_MODEL3D_STYLE,
  model3dFreeCameraPose,
  model3dKeyframedFreeCameraPose,
  model3dStyleWithPatch
} from "@nodetool-ai/timeline";
import { PREVIEW_OVERLAY_Z } from "@nodetool-ai/timeline/render";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStoreApi } from "../../../stores/timeline/TimelineInstance";
import {
  BORDER_RADIUS,
  Caption,
  SPACING,
  SPACING_PX
} from "../../ui_primitives";
import {
  freeCameraGestureCamera,
  freeCameraPosePatch
} from "../Inspector/model3dFreeCamera";
import {
  formatFreePose,
  freeDollyFromWheel,
  freeLensFromWheel,
  freeOrbitFromDrag,
  freeTruckFromDrag
} from "./model3dFreeCameraGesture";
import {
  formatOrbitPose,
  orbitCameraFromDrag,
  zoomFromWheel
} from "./model3dOrbitGesture";

/** How long after the last wheel notch the accumulated zoom is written. */
export const WHEEL_COMMIT_IDLE_MS = 250;

// A function, not a module-level value: `@nodetool-ai/timeline/render` has a
// top-level await (Yoga), and iOS Safari ran this module before that await
// resumed, so `PREVIEW_OVERLAY_Z` was still undefined here.
const overlayStyles = () =>
  css({
    position: "absolute",
    inset: 0,
    zIndex: PREVIEW_OVERLAY_Z.gizmo,
    pointerEvents: "none"
  });

const readoutStyles = (theme: Theme) =>
  css({
    position: "absolute",
    left: SPACING_PX.xs,
    bottom: SPACING_PX.xs,
    padding: theme.spacing(SPACING.micro, SPACING.sm),
    borderRadius: BORDER_RADIUS.sm,
    border: `1px solid ${theme.vars.palette.divider}`,
    backgroundColor: theme.vars.palette.background.paper,
    color: theme.vars.palette.text.primary,
    whiteSpace: "nowrap"
  });

/** The pointer gesture in flight. */
interface OrbitDrag {
  pointerId: number;
  startX: number;
  startY: number;
  startCamera: ClipModel3DCamera;
  /** Set on a free camera: Shift at pointer down trucks instead of orbiting. */
  free?: "orbit" | "truck";
}

/**
 * A free camera gesture in flight. Poses are composed: the authored pose plus
 * the keyframe channels at `atMs`.
 */
interface FreeGesture {
  start: Model3DFreeCameraPose;
  live: Model3DFreeCameraPose;
  /** Clip-relative playhead when the gesture began, or null off the clip. */
  atMs: number | null;
}

export interface Model3DOrbitOverlayProps {
  /** The selected clip. The overlay is inert unless it is a `model3d` clip. */
  clip: TimelineClip;
  /**
   * Preview frame height in CSS px — the pointer travel that turns the camera
   * a full 360°, the way OrbitControls reads its element's `clientHeight`.
   */
  frameHeight: number;
  /**
   * The pose the gesture is on, published on every step and `null` when it
   * ends. The host draws it so the picture tracks the drag while the document
   * stays at the value it had when the gesture began.
   */
  onPreviewCamera?: (camera: ClipModel3DCamera | null) => void;
}

export const Model3DOrbitOverlay: React.FC<Model3DOrbitOverlayProps> = memo(
  ({ clip, frameHeight, onPreviewCamera }) => {
    const theme = useTheme();
    const patchClip = useTimelineStore((s) => s.patchClip);
    const editClipKeyframes = useTimelineStore((s) => s.editClipKeyframes);
    const playbackApi = useTimelinePlaybackStoreApi();
    const rootRef = useRef<HTMLDivElement | null>(null);
    const [pose, setPose] = useState<ClipModel3DCamera | null>(null);
    const [freeReadout, setFreeReadout] = useState<string | null>(null);

    const enabled = clip.mediaType === "model3d";

    // Everything the listeners read, mirrored into refs so they are attached
    // once per mount instead of re-bound on every camera edit and every frame
    // resize.
    const styleRef = useRef<ClipModel3DStyle | undefined>(clip.model3dStyle);
    styleRef.current = clip.model3dStyle;
    const clipIdRef = useRef(clip.id);
    clipIdRef.current = clip.id;
    const clipRef = useRef(clip);
    clipRef.current = clip;
    const editRef = useRef(editClipKeyframes);
    editRef.current = editClipKeyframes;
    const frameHeightRef = useRef(frameHeight);
    frameHeightRef.current = frameHeight;
    const patchRef = useRef(patchClip);
    patchRef.current = patchClip;
    const previewRef = useRef(onPreviewCamera);
    previewRef.current = onPreviewCamera;

    useEffect(() => {
      const host = rootRef.current?.parentElement;
      if (!enabled || !host) {
        return;
      }

      const dragRef: { current: OrbitDrag | null } = { current: null };
      let wheelTimer: ReturnType<typeof setTimeout> | null = null;
      // The pose the gesture is on, mirroring `pose` for the listeners, which
      // are attached once and so never see a re-rendered value.
      let livePose: ClipModel3DCamera | null = null;

      const currentCamera = (): ClipModel3DCamera =>
        styleRef.current?.camera ?? DEFAULT_MODEL3D_STYLE.camera;

      const isFree = (): boolean => currentCamera().mode === "free";
      let freeGesture: FreeGesture | null = null;

      /** The free gesture in flight, started from the pose at the playhead. */
      const beginFree = (): FreeGesture => {
        if (freeGesture) {
          return freeGesture;
        }
        const current = clipRef.current;
        const now = playbackApi.getState().currentTimeMs - current.startMs;
        const atMs = now < 0 || now > current.durationMs ? null : now;
        const start =
          atMs === null
            ? model3dFreeCameraPose(currentCamera())
            : model3dKeyframedFreeCameraPose(current, atMs);
        freeGesture = { start, live: start, atMs };
        return freeGesture;
      };

      const showFree = (gesture: FreeGesture, next: Model3DFreeCameraPose) => {
        gesture.live = next;
        setFreeReadout(formatFreePose(next));
        previewRef.current?.(
          freeCameraGestureCamera(clipRef.current, next, gesture.atMs)
        );
      };

      const clearFree = () => {
        freeGesture = null;
        setFreeReadout(null);
        previewRef.current?.(null);
      };

      /** The one write a free gesture makes: a key or the authored pose. */
      const commitFree = () => {
        const gesture = freeGesture;
        if (!gesture) {
          return;
        }
        editRef.current(clipIdRef.current, (current) =>
          freeCameraPosePatch(current, gesture.start, gesture.live, gesture.atMs)
        );
      };

      const showPose = (next: ClipModel3DCamera) => {
        livePose = next;
        setPose(next);
        previewRef.current?.(next);
      };

      const clearPose = () => {
        livePose = null;
        setPose(null);
        previewRef.current?.(null);
      };

      /** The one write a gesture makes. Only the terms it moved. */
      const commit = (patch: Partial<ClipModel3DCamera>) => {
        patchRef.current(clipIdRef.current, {
          model3dStyle: model3dStyleWithPatch(styleRef.current, {
            camera: patch
          })
        });
      };

      /**
       * Write the zoom a wheel burst has accumulated, if one is still waiting
       * on its idle timer. Called when a pointer gesture takes over and on
       * unmount, so a zoom is never dropped for being 250 ms young.
       */
      const flushWheel = () => {
        if (wheelTimer === null) {
          return;
        }
        clearTimeout(wheelTimer);
        wheelTimer = null;
        if (freeGesture) {
          commitFree();
          freeGesture = null;
          return;
        }
        if (livePose) {
          commit({ zoom: livePose.zoom });
        }
      };

      const onPointerMove = (e: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag || e.pointerId !== drag.pointerId) {
          return;
        }
        if (drag.free && freeGesture) {
          const from = drag.free === "truck" ? freeTruckFromDrag : freeOrbitFromDrag;
          showFree(
            freeGesture,
            from(
              freeGesture.start,
              e.clientX - drag.startX,
              e.clientY - drag.startY,
              frameHeightRef.current
            )
          );
          return;
        }
        showPose({
          ...drag.startCamera,
          ...orbitCameraFromDrag(
            drag.startCamera,
            e.clientX - drag.startX,
            e.clientY - drag.startY,
            frameHeightRef.current
          )
        });
      };

      const stopDrag = () => {
        dragRef.current = null;
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerCancel);
      };

      function onPointerUp(e: PointerEvent) {
        const drag = dragRef.current;
        if (!drag || e.pointerId !== drag.pointerId) {
          return;
        }
        if (drag.free) {
          stopDrag();
          // A drag that never moved patches nothing: the patch is null.
          commitFree();
          clearFree();
          return;
        }
        const next = livePose;
        stopDrag();
        // An Alt-click that never moved leaves the camera where it was; writing
        // it would cost an undo entry that reverts nothing.
        if (
          next &&
          (next.azimuthDeg !== drag.startCamera.azimuthDeg ||
            next.elevationDeg !== drag.startCamera.elevationDeg)
        ) {
          commit({
            azimuthDeg: next.azimuthDeg,
            elevationDeg: next.elevationDeg
          });
        }
        clearPose();
      }

      // A cancelled pointer (the browser took it over, the touch was
      // interrupted) is an abandoned gesture, so it writes nothing.
      function onPointerCancel(e: PointerEvent) {
        if (!dragRef.current || e.pointerId !== dragRef.current.pointerId) {
          return;
        }
        const wasFree = dragRef.current.free !== undefined;
        stopDrag();
        if (wasFree) {
          clearFree();
          return;
        }
        clearPose();
      }

      const onPointerDown = (e: PointerEvent) => {
        if (!e.altKey || e.button !== 0 || dragRef.current) {
          return;
        }
        // Claim the gesture before the transform gizmo's handles see it.
        e.preventDefault();
        e.stopPropagation();
        // A zoom still on its timer is this user's too: land it, and orbit on
        // from where it left the camera.
        flushWheel();
        if (isFree()) {
          dragRef.current = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            startCamera: currentCamera(),
            free: e.shiftKey ? "truck" : "orbit"
          };
          const gesture = beginFree();
          showFree(gesture, gesture.start);
          window.addEventListener("pointermove", onPointerMove);
          window.addEventListener("pointerup", onPointerUp);
          window.addEventListener("pointercancel", onPointerCancel);
          return;
        }
        const startCamera = livePose ?? currentCamera();
        dragRef.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          startCamera
        };
        showPose(startCamera);
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointercancel", onPointerCancel);
      };

      const onWheel = (e: WheelEvent) => {
        // A drag commits azimuth and elevation only, so a wheel mid-drag would
        // show a zoom that is then dropped. Leave it to the browser.
        if (!e.altKey || dragRef.current) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (isFree()) {
          const gesture = beginFree();
          // Ctrl (Cmd on macOS) turns the dolly into a lens change.
          const from =
            e.ctrlKey || e.metaKey ? freeLensFromWheel : freeDollyFromWheel;
          showFree(gesture, from(gesture.live, e.deltaY));
        } else {
          const base = livePose ?? currentCamera();
          showPose({ ...base, zoom: zoomFromWheel(base.zoom, e.deltaY) });
        }
        if (wheelTimer !== null) {
          clearTimeout(wheelTimer);
        }
        wheelTimer = setTimeout(() => {
          const wasFree = freeGesture !== null;
          flushWheel();
          if (wasFree) {
            clearFree();
          } else {
            clearPose();
          }
        }, WHEEL_COMMIT_IDLE_MS);
      };

      host.addEventListener("pointerdown", onPointerDown, true);
      host.addEventListener("wheel", onWheel, {
        capture: true,
        passive: false
      });
      return () => {
        host.removeEventListener("pointerdown", onPointerDown, true);
        host.removeEventListener("wheel", onWheel, true);
        stopDrag();
        flushWheel();
        // Unmounted mid-gesture: the host must stop drawing a pose the
        // document never took. `setPose` is deliberately not called — this
        // component is on its way out.
        if (livePose || freeGesture) {
          livePose = null;
          freeGesture = null;
          previewRef.current?.(null);
        }
      };
    }, [enabled, playbackApi]);

    if (!enabled) {
      return null;
    }

    return (
      <div
        ref={rootRef}
        css={overlayStyles()}
        data-testid="timeline-model3d-orbit-overlay"
      >
        {(pose || freeReadout) && (
          <div css={readoutStyles(theme)} role="status">
            <Caption size="smaller">
              {freeReadout ?? (pose ? formatOrbitPose(pose) : "")}
            </Caption>
          </div>
        )}
      </div>
    );
  }
);

Model3DOrbitOverlay.displayName = "Model3DOrbitOverlay";
