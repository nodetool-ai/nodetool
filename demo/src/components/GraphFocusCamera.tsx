import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AbsoluteFill,
  cancelRender,
  continueRender,
  delayRender,
  useRemotionEnvironment,
  useVideoConfig,
} from "remotion";
import {
  buildShotCameraKeys,
  resolveTargetBounds,
  shotAt,
  shotCameraAt,
  type Rect,
  type Viewport,
} from "../camera";
import { presentationToCastTime } from "../tutorialTiming";
import type { FocusTarget, TimeMap, TutorialShot } from "../types";
import { FocusOverlay } from "./FocusOverlay";
import {
  TUTORIAL_CAMERA_SETTLE_MS,
  TUTORIAL_DEFAULT_SAFE_AREA,
  TUTORIAL_FOCUS_FADE_MS,
} from "../tutorialTheme";

interface GraphFocusCameraProps {
  tutorialId: string;
  shots: readonly TutorialShot[];
  presentationTimeMs: number;
  timeMap?: TimeMap;
  overviewViewport: Viewport;
  children: (
    castTimeMs: number,
    viewport: Viewport
  ) => React.ReactNode;
}

const union = (rects: readonly Rect[]): Rect => {
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
};

const label = (target: FocusTarget): string => target.kind === "node"
  ? `node:${target.nodeId}`
  : target.kind === "group"
    ? `group:${target.targets.map(label).join(",")}`
    : target.kind;

const targetElements = (root: HTMLElement, target: FocusTarget): readonly HTMLElement[] => {
  if (target.kind === "overview") {
    return Array.from(root.querySelectorAll<HTMLElement>(".react-flow__node[data-id]"));
  }
  if (target.kind === "node") {
    const element = root.querySelector<HTMLElement>(
      `.react-flow__node[data-id="${CSS.escape(target.nodeId)}"]`
    );
    return element ? [element] : [];
  }
  if (target.kind === "group") {
    return target.targets.flatMap((member) => targetElements(root, member));
  }
  return [];
};

const waitForLayout = async (elements: readonly HTMLElement[]): Promise<void> => {
  await document.fonts.ready;
  const images = elements.flatMap((element) => Array.from(element.querySelectorAll("img")));
  const videos = elements.flatMap((element) => Array.from(element.querySelectorAll("video")));
  await Promise.all([
    ...images.map(async (image) => {
      if (image.complete) return image.decode().catch(() => undefined);
      await new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });
    }),
    ...videos.map(async (video) => {
      if (!video.currentSrc || video.error || video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
      await new Promise<void>((resolve) => {
        video.addEventListener("loadeddata", () => resolve(), { once: true });
        video.addEventListener("error", () => resolve(), { once: true });
      });
    }),
  ]);
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
};

/** Measures graph-space targets at shot anchors, then drives ReactFlow directly. */
export const GraphFocusCamera: React.FC<GraphFocusCameraProps> = ({
  tutorialId,
  shots,
  presentationTimeMs,
  timeMap,
  overviewViewport,
  children,
}) => {
  const { width, height } = useVideoConfig();
  const environment = useRemotionEnvironment();
  const delayHandle = useRef<number | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [boundsByShot, setBoundsByShot] = useState<ReadonlyMap<string, Rect>>(new Map());
  const [missingTarget, setMissingTarget] = useState<string>();
  const active = shotAt(shots, presentationTimeMs);
  const activeIndex = active ? shots.indexOf(active) : -1;
  const required = activeIndex > 0
    ? [shots[activeIndex - 1], active].filter((shot): shot is TutorialShot => shot !== undefined)
    : active ? [active] : [];
  const measuring = required.find((shot) => !boundsByShot.has(shot.id));
  const measurementTime = measuring
    ? measuring.anchorMs ?? measuring.fromMs + (measuring.moveMs ?? 650)
    : presentationTimeMs;

  if (delayHandle.current === null && measuring) {
    delayHandle.current = delayRender(`Measure graph target ${tutorialId}/${measuring.id}`);
  }

  const capture = useCallback((nodeBounds: Readonly<Record<string, Rect>>) => {
    if (!measuring) return;
    const values = Object.values(nodeBounds);
    const overview = union(values);
    const resolver = (target: FocusTarget): Rect | undefined =>
      target.kind === "node" ? nodeBounds[target.nodeId] : undefined;
    const bounds = overview
      ? resolveTargetBounds(measuring.target, measurementTime, resolver, overview)
      : undefined;
    if (!bounds) {
      const detail = `${tutorialId} / ${measuring.id} / ${label(measuring.target)} / ${measurementTime}ms`;
      setMissingTarget(detail);
      if (delayHandle.current !== null) continueRender(delayHandle.current);
      delayHandle.current = null;
      if (environment.isRendering) cancelRender(new Error(`Missing graph focus target: ${detail}`));
      return;
    }
    setBoundsByShot((current) => new Map(current).set(measuring.id, bounds));
  }, [environment.isRendering, measurementTime, measuring, tutorialId]);

  useEffect(() => {
    if (!measuring || !surfaceRef.current) return;
    let cancelled = false;
    const measure = async (): Promise<void> => {
      if (cancelled) return;
      const root = surfaceRef.current;
      if (!root) return;
      const elements = Array.from(root.querySelectorAll<HTMLElement>(".react-flow__node[data-id]"));
      if (elements.length === 0) {
        requestAnimationFrame(() => void measure());
        return;
      }
      await waitForLayout(targetElements(root, measuring.target));
      if (cancelled) return;
      const rootRect = root.getBoundingClientRect();
      const zoom = overviewViewport.zoom;
      const bounds = Object.fromEntries(elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return [element.dataset.id as string, {
          x: (rect.left - rootRect.left - overviewViewport.x) / zoom,
          y: (rect.top - rootRect.top - overviewViewport.y) / zoom,
          width: rect.width / zoom,
          height: rect.height / zoom,
        }];
      }));
      capture(bounds);
    };
    void measure();
    return () => { cancelled = true; };
  }, [capture, measuring, overviewViewport]);

  useEffect(() => {
    if (!measuring && delayHandle.current !== null) {
      continueRender(delayHandle.current);
      delayHandle.current = null;
    }
  }, [measuring]);

  useEffect(() => () => {
    if (delayHandle.current !== null) {
      continueRender(delayHandle.current);
      delayHandle.current = null;
    }
  }, []);

  let viewport = overviewViewport;
  if (!measuring && required.length > 0) {
    viewport = shotCameraAt(
      buildShotCameraKeys(required, boundsByShot, { width, height }, TUTORIAL_DEFAULT_SAFE_AREA),
      presentationTimeMs
    );
  }
  const activeBounds = active ? boundsByShot.get(active.id) : undefined;
  const moveEnd = active ? active.fromMs + (active.moveMs ?? 650) : presentationTimeMs;
  const emphasisStart = Math.max(
    moveEnd + TUTORIAL_CAMERA_SETTLE_MS,
    active?.actionAtMs ?? moveEnd
  );
  const fadeIn = Math.min(1, Math.max(0, (presentationTimeMs - emphasisStart) / TUTORIAL_FOCUS_FADE_MS));
  const fadeOut = active
    ? Math.min(1, Math.max(0, (active.toMs - presentationTimeMs) / TUTORIAL_FOCUS_FADE_MS))
    : 0;

  return (
    <AbsoluteFill style={{ overflow: "hidden", isolation: "isolate", zIndex: 0 }}>
      <div ref={surfaceRef} style={{ position: "absolute", inset: 0 }}>
        {children(
          presentationToCastTime(measurementTime, timeMap),
          measuring ? overviewViewport : viewport
        )}
      </div>
      {!measuring && active && activeBounds && active.emphasis ? (
        <FocusOverlay bounds={activeBounds} viewport={viewport} emphasis={active.emphasis} opacity={Math.min(fadeIn, fadeOut)} />
      ) : null}
      {missingTarget && !environment.isRendering ? (
        <div style={{ position: "absolute", inset: 24, padding: 24, color: "white", background: "rgba(80,0,15,.9)", border: "3px solid #ff3b5c", zIndex: 30 }}>
          Focus diagnostic: {missingTarget}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
