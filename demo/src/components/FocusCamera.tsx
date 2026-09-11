import React, { useEffect, useRef, useState } from "react";
import {
  AbsoluteFill,
  cancelRender,
  continueRender,
  delayRender,
  useRemotionEnvironment,
  useVideoConfig
} from "remotion";
import {
  CAMERA_BASE_HEIGHT,
  CAMERA_BASE_WIDTH,
  buildShotCameraKeys,
  resolveTargetBounds,
  shotAt,
  shotAnchorMs,
  shotCameraAt,
  type Rect,
  type SafeArea,
  type TargetResolver
} from "../camera";
import { presentationToCastTime } from "../tutorialTiming";
import type { FocusTarget, TimeMap, TutorialShot } from "../types";
import { FocusOverlay } from "./FocusOverlay";
import {
  TUTORIAL_DEFAULT_SAFE_AREA,
  TUTORIAL_CAMERA_SETTLE_MS,
  TUTORIAL_FOCUS_FADE_MS
} from "../tutorialTheme";

export interface FocusCameraProps {
  tutorialId: string;
  shots: readonly TutorialShot[];
  presentationTimeMs: number;
  timeMap?: TimeMap;
  safeArea?: SafeArea;
  /** Graph targets can supply graph-space bounds. Component targets default to DOM measurement. */
  resolveTarget?: TargetResolver;
  /** Called at shot anchors during measurement, then at the requested presentation time. */
  children: (
    presentationTimeMs: number,
    castTimeMs: number,
    focusIds: readonly string[]
  ) => React.ReactNode;
}

const targetLabel = (target: FocusTarget): string => {
  if (target.kind === "overview") return "overview";
  if (target.kind === "node") return `node:${target.nodeId}`;
  if (target.kind === "component") return `component:${target.focusId}`;
  return `group(${target.targets.map(targetLabel).join(", ")})`;
};

const componentFocusIds = (
  target: FocusTarget | undefined
): readonly string[] => {
  if (!target || target.kind === "overview" || target.kind === "node")
    return [];
  if (target.kind === "component") return [target.focusId];
  return target.targets.flatMap(componentFocusIds);
};

const relativeDomRect = (
  root: HTMLElement,
  selector: string
): Rect | undefined => {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) return undefined;
  const rootRect = root.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return {
    x: (rect.left - rootRect.left) * (CAMERA_BASE_WIDTH / rootRect.width),
    y: (rect.top - rootRect.top) * (CAMERA_BASE_HEIGHT / rootRect.height),
    width: rect.width * (CAMERA_BASE_WIDTH / rootRect.width),
    height: rect.height * (CAMERA_BASE_HEIGHT / rootRect.height)
  };
};

const domResolver = (
  root: HTMLElement,
  target: FocusTarget
): Rect | undefined => {
  if (target.kind === "component") {
    return relativeDomRect(
      root,
      `[data-focus-id="${CSS.escape(target.focusId)}"]`
    );
  }
  if (target.kind === "node") {
    return relativeDomRect(
      root,
      `[data-focus-node-id="${CSS.escape(target.nodeId)}"]`
    );
  }
  return undefined;
};

const domTargetElements = (
  root: HTMLElement,
  target: FocusTarget
): readonly HTMLElement[] => {
  if (target.kind === "component") {
    const element = root.querySelector<HTMLElement>(
      `[data-focus-id="${CSS.escape(target.focusId)}"]`
    );
    return element ? [element] : [];
  }
  if (target.kind === "node") {
    const element = root.querySelector<HTMLElement>(
      `[data-focus-node-id="${CSS.escape(target.nodeId)}"]`
    );
    return element ? [element] : [];
  }
  if (target.kind === "group") {
    return target.targets.flatMap((member) => domTargetElements(root, member));
  }
  return [];
};

const hasDomTarget = (root: HTMLElement, target: FocusTarget): boolean => {
  if (target.kind === "overview") return true;
  if (target.kind === "group") {
    return target.targets.every((member) => hasDomTarget(root, member));
  }
  return domTargetElements(root, target).length === 1;
};

const waitForMedia = async (
  elements: readonly HTMLElement[]
): Promise<void> => {
  const images = elements.flatMap((element) => [
    ...(element instanceof HTMLImageElement ? [element] : []),
    ...Array.from(element.querySelectorAll("img"))
  ]);
  const videos = elements.flatMap((element) => [
    ...(element instanceof HTMLVideoElement ? [element] : []),
    ...Array.from(element.querySelectorAll("video"))
  ]);
  await Promise.all([
    ...images.map(async (image) => {
      if (image.complete) {
        await image.decode().catch(() => undefined);
        return;
      }
      await new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });
    }),
    ...videos.map(async (video) => {
      if (
        !video.currentSrc ||
        video.error ||
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      )
        return;
      await new Promise<void>((resolve) => {
        video.addEventListener("loadeddata", () => resolve(), { once: true });
        video.addEventListener("error", () => resolve(), { once: true });
      });
    })
  ]);
};

const waitForDomTarget = async (
  root: HTMLElement,
  target: FocusTarget,
  timeoutMs = 2000
): Promise<void> => {
  const startedAt = performance.now();
  while (
    !hasDomTarget(root, target) &&
    performance.now() - startedAt < timeoutMs
  ) {
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
};

/** Fixed-layout camera. The single surface is first sampled at required anchors, then at the requested frame. */
export const FocusCamera: React.FC<FocusCameraProps> = ({
  tutorialId,
  shots,
  presentationTimeMs,
  timeMap,
  safeArea,
  resolveTarget,
  children
}) => {
  const { width, height } = useVideoConfig();
  const environment = useRemotionEnvironment();
  const rootRef = useRef<HTMLDivElement>(null);
  const delayHandle = useRef<number | null>(null);
  const active = shotAt(shots, presentationTimeMs);
  const activeIndex = active ? shots.indexOf(active) : -1;
  const requiredShots: TutorialShot[] = [];
  if (activeIndex > 0) {
    const previous = shots[activeIndex - 1];
    if (previous) requiredShots.push(previous);
  }
  if (active) requiredShots.push(active);
  const [boundsByShot, setBoundsByShot] = useState<ReadonlyMap<string, Rect>>(
    new Map()
  );
  const [failedShotIds, setFailedShotIds] = useState<ReadonlySet<string>>(
    new Set()
  );
  const [diagnostic, setDiagnostic] = useState<string>();
  const renderedShot = requiredShots.find(
    (shot) => !boundsByShot.has(shot.id) && !failedShotIds.has(shot.id)
  );
  const measuring = renderedShot !== undefined;
  const renderedTime =
    measuring && renderedShot ? shotAnchorMs(renderedShot) : presentationTimeMs;

  if (delayHandle.current === null && measuring) {
    delayHandle.current = delayRender(
      `Measure focus targets for ${tutorialId}`
    );
  }

  useEffect(() => {
    if (!measuring || !renderedShot || !rootRef.current) return;
    let cancelled = false;
    const root = rootRef.current;
    if (!root) return;
    const measure = async (): Promise<void> => {
      await document.fonts.ready;
      if (!resolveTarget && renderedShot.target.kind !== "overview") {
        await waitForDomTarget(root, renderedShot.target);
        await waitForMedia(domTargetElements(root, renderedShot.target));
      }
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
      if (cancelled) return;
      const overview = {
        x: 0,
        y: 0,
        width: CAMERA_BASE_WIDTH,
        height: CAMERA_BASE_HEIGHT
      };
      const resolver: TargetResolver = (target, anchorMs) =>
        resolveTarget?.(target, anchorMs) ?? domResolver(root, target);
      const bounds = resolveTargetBounds(
        renderedShot.target,
        renderedTime,
        resolver,
        overview
      );
      if (!bounds) {
        if (delayHandle.current !== null) continueRender(delayHandle.current);
        delayHandle.current = null;
        const message = `Tutorial ${tutorialId}: shot ${renderedShot.id} cannot resolve ${targetLabel(renderedShot.target)} at ${renderedTime}ms`;
        if (environment.isRendering) {
          cancelRender(new Error(message));
          return;
        }
        setFailedShotIds((current) => new Set(current).add(renderedShot.id));
        setDiagnostic(`Focus diagnostic: ${message}`);
        return;
      }
      setBoundsByShot((current) =>
        new Map(current).set(renderedShot.id, bounds)
      );
    };
    void measure();
    return () => {
      cancelled = true;
    };
  }, [
    environment.isRendering,
    measuring,
    renderedShot,
    renderedTime,
    resolveTarget,
    tutorialId
  ]);

  useEffect(() => {
    if (!measuring && delayHandle.current !== null) {
      continueRender(delayHandle.current);
      delayHandle.current = null;
    }
  }, [measuring]);

  useEffect(
    () => () => {
      if (delayHandle.current !== null) {
        continueRender(delayHandle.current);
        delayHandle.current = null;
      }
    },
    []
  );

  let viewport = { x: 0, y: 0, zoom: 1 };
  if (!measuring && active) {
    const relevant = requiredShots.filter((shot) => boundsByShot.has(shot.id));
    if (relevant.length > 0) {
      viewport = shotCameraAt(
        buildShotCameraKeys(
          relevant,
          boundsByShot,
          { width: CAMERA_BASE_WIDTH, height: CAMERA_BASE_HEIGHT },
          safeArea ?? TUTORIAL_DEFAULT_SAFE_AREA
        ),
        presentationTimeMs
      );
    }
  }
  const scale = Math.min(
    width / CAMERA_BASE_WIDTH,
    height / CAMERA_BASE_HEIGHT
  );
  const offsetX = (width - CAMERA_BASE_WIDTH * scale) / 2;
  const offsetY = (height - CAMERA_BASE_HEIGHT * scale) / 2;
  const activeBounds = active ? boundsByShot.get(active.id) : undefined;
  const displayViewport = {
    x: offsetX + viewport.x * scale,
    y: offsetY + viewport.y * scale,
    zoom: viewport.zoom * scale
  };
  const moveEnd = active
    ? active.fromMs + (active.moveMs ?? 650)
    : presentationTimeMs;
  const emphasisStart = Math.max(
    moveEnd + TUTORIAL_CAMERA_SETTLE_MS,
    active?.actionAtMs ?? moveEnd
  );
  const fadeIn = Math.min(
    1,
    Math.max(0, (presentationTimeMs - emphasisStart) / TUTORIAL_FOCUS_FADE_MS)
  );
  const fadeOut = active
    ? Math.min(
        1,
        Math.max(0, (active.toMs - presentationTimeMs) / TUTORIAL_FOCUS_FADE_MS)
      )
    : 0;

  return (
    <AbsoluteFill
      style={{ overflow: "hidden", isolation: "isolate", zIndex: 0 }}
    >
      <div
        ref={rootRef}
        style={{
          position: "absolute",
          width: CAMERA_BASE_WIDTH,
          height: CAMERA_BASE_HEIGHT,
          transformOrigin: "0 0",
          transform: measuring
            ? `translate(${offsetX}px, ${offsetY}px) scale(${scale})`
            : `translate(${offsetX}px, ${offsetY}px) scale(${scale}) translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`
        }}
      >
        {children(
          renderedTime,
          presentationToCastTime(renderedTime, timeMap),
          componentFocusIds(renderedShot?.target ?? active?.target)
        )}
      </div>
      {!measuring && active && activeBounds && active.emphasis ? (
        <FocusOverlay
          bounds={activeBounds}
          viewport={displayViewport}
          emphasis={active.emphasis}
          opacity={Math.min(fadeIn, fadeOut)}
        />
      ) : null}
      {diagnostic && !environment.isRendering ? (
        <div
          style={{
            position: "absolute",
            inset: 24,
            border: "3px solid #ff3b5c",
            color: "white",
            background: "rgba(80,0,15,.9)",
            padding: 24,
            zIndex: 30
          }}
        >
          {diagnostic}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
