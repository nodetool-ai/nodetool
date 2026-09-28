import type {
  ClipEffect,
  TimelineClip,
  TimelineDocument
} from "@nodetool-ai/protocol/api-schemas/timeline.js";
import {
  compileClipAnimations,
  isKnownShapeKind,
  parseClipEffectType,
  resolveBeatAnimations
} from "@nodetool-ai/timeline";
import type { TimelineDebugIssue } from "./types.js";

type Window = { start: number; end: number };
const MIN_LAYERS = 3;
const MIN_COVERAGE = 0.8;
// Shipped showcases (excluding t-minus-30), measured from their visible spans:
// kite: 23 groups, 100/15 custom/s, 6 effect types, 140/15 clips/s
// prism: 16, 55/18, 10, 87/18; serein: 60, 173/26, 7, 678/26
// tidewater: 22, 39/16, 6, 180/16; voltra: 12, 103/23, 13, 124/23.
// Medians: 22 groups, 103/23 custom/s, 7 effects, 140/15 clips/s.
// A median floor would reject shipped examples. Use their lower envelope for
// warnings, report the median target, and require rendered example comparison.
const SHOWCASE_FLOOR = {
  groups: 12,
  customPerSecond: 39 / 16,
  effects: 6,
  clipsPerSecond: 87 / 18
};
const SHOWCASE_TARGET = {
  groups: 22,
  customPerSecond: 103 / 23,
  effects: 7,
  clipsPerSecond: 140 / 15
};
// Segment-average speed, normalized to canvas dimensions. Sharp cuts can
// intentionally exceed this proxy, so the skill requires a visual justification.
const FAST_POSITION_PER_SECOND = 20;
const FAST_SCALE_PER_SECOND = 20;
const FINISH_EFFECT_TYPES = [
  "grain",
  "vignette",
  "color",
  "curves",
  "levels",
  "liftGammaGain",
  "lut"
];

/** Static eligibility only. Assets, occlusion, sampled opacity and aesthetics need rendered review. */
function hasVisualContent(clip: TimelineClip): boolean {
  if (clip.mediaType === "text") {
    return Boolean(clip.textStyle?.text.trim());
  }
  if (clip.mediaType === "shape") {
    return Boolean(clip.shapeStyle && isKnownShapeKind(clip.shapeStyle.kind));
  }
  return (
    ["image", "video", "overlay", "model3d"].includes(clip.mediaType) &&
    Boolean(clip.currentAssetId)
  );
}

/** Memoized parent windows: iterative, linear even for deeply nested scenes. */
function activeWindows(doc: TimelineDocument): Map<string, Window | null> {
  const clips = new Map(doc.clips.map((clip) => [clip.id, clip]));
  const tracks = new Map(doc.tracks.map((track) => [track.id, track]));
  const windows = new Map<string, Window | null>();
  for (const clip of doc.clips) {
    if (windows.has(clip.id)) {
      continue;
    }
    const chain: TimelineClip[] = [];
    const seen = new Set<string>();
    let current: TimelineClip | undefined = clip;
    let parentWindow: Window | null | undefined;
    while (current && !windows.has(current.id)) {
      if (seen.has(current.id)) {
        parentWindow = null;
        break;
      }
      seen.add(current.id);
      chain.push(current);
      const parent: TimelineClip | undefined = current.parentId
        ? clips.get(current.parentId)
        : undefined;
      current = parent?.mediaType === "group" ? parent : undefined;
    }
    if (current && windows.has(current.id)) {
      parentWindow = windows.get(current.id);
    }
    for (let i = chain.length - 1; i >= 0; i -= 1) {
      const entry = chain[i];
      if (!entry) {
        continue;
      }
      const track = tracks.get(entry.trackId);
      const scale = entry.transform?.scale;
      const active =
        parentWindow !== null &&
        track?.visible &&
        (track.type === "video" || track.type === "overlay") &&
        !entry.hidden &&
        (entry.opacity ?? 1) > 0 &&
        scale?.x !== 0 &&
        scale?.y !== 0;
      const start = Math.max(0, entry.startMs, parentWindow?.start ?? 0);
      const end = Math.min(
        entry.startMs + entry.durationMs,
        parentWindow?.end ?? Infinity
      );
      parentWindow = active && end > start ? { start, end } : null;
      windows.set(entry.id, parentWindow);
    }
  }
  return windows;
}

function hasFinish(effect: ClipEffect): boolean {
  if (!effect.enabled) {
    return false;
  }
  if (effect.type === "grain" || effect.type === "vignette") {
    return typeof effect.amount === "number" && effect.amount > 0;
  }
  if (effect.type === "lut") {
    return (
      effect.intensity !== 0 &&
      typeof effect.cube === "string" &&
      effect.cube.length > 0
    );
  }
  if (effect.type === "color") {
    return Object.entries(effect).some(
      ([key, value]) =>
        !["id", "type", "enabled"].includes(key) &&
        typeof value === "number" &&
        value !== (["contrast", "saturation"].includes(key) ? 1 : 0)
    );
  }
  if (effect.type === "curves") {
    return [effect.master, effect.r, effect.g, effect.b].some(
      (points) =>
        Array.isArray(points) &&
        points.some(
          (point: unknown) =>
            typeof point === "object" &&
            point !== null &&
            "x" in point &&
            "y" in point &&
            point.x !== point.y
        )
    );
  }
  if (effect.type === "levels") {
    return (
      effect.inBlack !== 0 ||
      effect.inWhite !== 1 ||
      effect.gamma !== 1 ||
      effect.outBlack !== 0 ||
      effect.outWhite !== 1
    );
  }
  if (effect.type === "liftGammaGain") {
    return [effect.lift, effect.gamma, effect.gain].some(
      (values, i) =>
        Array.isArray(values) &&
        values.some((value: unknown) => value !== (i === 0 ? 0 : 1))
    );
  }
  return false;
}

/** Three independent visual clips for 80% of the first-to-last visible span, including gaps. O(n log n). */
function layerCoverage(windows: readonly Window[]): number {
  if (windows.length === 0) {
    return 0;
  }
  const events = windows.flatMap((window) => [
    { time: window.start, delta: 1 },
    { time: window.end, delta: -1 }
  ]);
  events.sort((a, b) => a.time - b.time);
  const first = events[0];
  const last = events[events.length - 1];
  if (!first || !last || last.time <= first.time) {
    return 0;
  }
  let count = 0;
  let covered = 0;
  let previous = first.time;
  for (const event of events) {
    if (count >= MIN_LAYERS) {
      covered += event.time - previous;
    }
    count += event.delta;
    previous = event.time;
  }
  return covered / (last.time - first.time);
}

export function checkShowcase(
  doc: TimelineDocument,
  canvas: { width: number; height: number }
): TimelineDebugIssue[] {
  const windows = activeWindows(doc);
  const visual = doc.clips.filter(
    (clip) => windows.get(clip.id) && hasVisualContent(clip)
  );
  const usedGroups = new Set<string>();
  const byId = new Map(doc.clips.map((clip) => [clip.id, clip]));
  // Stop at a previously visited ancestor, so shared or deep chains remain linear.
  for (const clip of visual) {
    let parent = clip.parentId ? byId.get(clip.parentId) : undefined;
    while (parent?.mediaType === "group" && !usedGroups.has(parent.id)) {
      usedGroups.add(parent.id);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
  }
  const visualIds = new Set(visual.map((clip) => clip.id));
  const structural = doc.clips.filter(
    (clip) => usedGroups.has(clip.id) || visualIds.has(clip.id)
  );
  const visibleWindows = visual.flatMap((clip) => {
    const window = windows.get(clip.id);
    return window ? [window] : [];
  });
  const support = [...visibleWindows].sort((a, b) => a.start - b.start);
  const merged: Window[] = [];
  for (const window of support) {
    const last = merged[merged.length - 1];
    if (last && window.start <= last.end) {
      last.end = Math.max(last.end, window.end);
    } else {
      merged.push({ ...window });
    }
  }
  const overlapsVisible = (window: Window): boolean => {
    let low = 0;
    let high = merged.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = merged[mid];
      if (candidate && candidate.end <= window.start) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    const candidate = merged[low];
    return Boolean(candidate && candidate.start < window.end);
  };
  const active = doc.clips.filter((clip) => {
    const window = windows.get(clip.id);
    return (
      window &&
      (usedGroups.has(clip.id) ||
        visualIds.has(clip.id) ||
        (clip.mediaType === "adjustment" &&
          (!clip.parentId || usedGroups.has(clip.parentId)) &&
          overlapsVisible(window)))
    );
  });
  let customCount = 0;
  const fastWithoutBlur: string[] = [];
  for (const clip of active) {
    const window = windows.get(clip.id);
    if (!window) {
      continue;
    }
    const animations = resolveBeatAnimations(clip, doc.tempo);
    const compiled = compileClipAnimations(animations, clip.durationMs, canvas);
    let fast = false;
    for (const animation of compiled) {
      if (
        clip.startMs + animation.windowStartMs >= window.end ||
        clip.startMs + animation.windowEndMs <= window.start
      ) {
        continue;
      }
      for (const curve of animation.curves) {
        const dimension = ["positionX", "offsetX"].includes(curve.property)
          ? canvas.width
          : ["positionY", "offsetY"].includes(curve.property)
            ? canvas.height
            : ["scale", "scaleX", "scaleY"].includes(curve.property)
              ? 1
              : 0;
        if (!dimension) {
          continue;
        }
        for (let i = 1; i < curve.keyframes.length; i += 1) {
          const a = curve.keyframes[i - 1];
          const b = curve.keyframes[i];
          if (!a || !b) {
            continue;
          }
          const seconds =
            ((b.t - a.t) *
              (animation.stagger?.unitDurationMs ??
                animation.periodMs ??
                animation.windowEndMs - animation.windowStartMs)) /
            1000;
          if (seconds <= 0) {
            continue;
          }
          const speed = Math.abs(b.value - a.value) / dimension / seconds;
          fast ||=
            speed >
            (dimension === 1
              ? FAST_SCALE_PER_SECOND
              : FAST_POSITION_PER_SECOND);
        }
      }
    }
    const customAnimations = animations?.filter((a) => a.preset === "custom");
    const customById = new Map(customAnimations?.map((a) => [a.id, a]));
    customCount += compileClipAnimations(
      customAnimations,
      clip.durationMs,
      canvas
    ).filter(
      (animation) =>
        clip.startMs + animation.windowStartMs < window.end &&
        clip.startMs + animation.windowEndMs > window.start &&
        (animation.curves.some((curve) =>
          curve.keyframes.some((k) => k.value !== curve.keyframes[0]?.value)
        ) ||
          customById
            .get(animation.id)
            ?.styleTracks?.some((track) =>
              track.keyframes.some((k) => k.value !== track.keyframes[0]?.value)
            ) ||
          customById.get(animation.id)?.textAnimator)
    ).length;
    if (
      fast &&
      !(
        clip.motionBlur &&
        clip.motionBlur.shutterAngle > 0 &&
        clip.motionBlur.samplesPerFrame >= 2
      )
    ) {
      fastWithoutBlur.push(clip.name || clip.id);
    }
  }
  const custom = customCount > 0;
  const seconds = visibleWindows.length
    ? (visibleWindows.reduce((end, w) => Math.max(end, w.end), 0) -
        visibleWindows.reduce(
          (start, w) => Math.min(start, w.start),
          Infinity
        )) /
      1000
    : 0;
  const activeTrackIds = new Set(active.map((clip) => clip.trackId));
  const effectTypes = new Set(
    [
      ...active.flatMap((clip) => clip.effects ?? []),
      ...doc.tracks
        .filter((track) => activeTrackIds.has(track.id))
        .flatMap((track) => track.effects ?? [])
    ]
      .filter(
        (effect) => effect.enabled && parseClipEffectType(effect.type) !== null
      )
      .map((effect) => effect.type)
  );
  const customDensity = seconds > 0 ? customCount / seconds : 0;
  const clipDensity = seconds > 0 ? active.length / seconds : 0;
  const finish = active.some((clip) => clip.effects?.some(hasFinish));
  const camera = Boolean(
    doc.camera2d &&
    (structural.some((clip) => clip.transform?.depthPx !== undefined) ||
      doc.camera2d.keyframes?.some(
        (k) =>
          k.depthPx !== doc.camera2d?.depthPx ||
          k.position.x !== doc.camera2d?.position.x ||
          k.position.y !== doc.camera2d?.position.y
      ))
  );
  const coverage = layerCoverage(visibleWindows);
  const issues: TimelineDebugIssue[] = [];
  const warn = (code: string, message: string): void => {
    issues.push({ severity: "warning", code, message });
  };
  if (usedGroups.size === 0) {
    warn(
      "showcase_scene_groups_missing",
      "Showcase structure: no active scene group contains visible content. See voltra: grouped beats and hero rigs. Parent each scene's visual clips to a group so its timing and motion can be directed together."
    );
  }
  if (!custom) {
    warn(
      "showcase_custom_motion_missing",
      "Showcase structure: no active custom animation has changing keyframes in its visible window. See tidewater: secondary curves. Add a custom curve to a visible clip or scene group and check its timing."
    );
  }
  if (!finish) {
    warn(
      "showcase_finish_missing",
      "Showcase structure: no active grain, vignette or non-neutral color grade is enabled on visible content or an adjustment. See serein: grain and vignette on the finish. Add a restrained finish and inspect a rendered frame."
    );
  }
  // Prism and tidewater establish dense planar motion without a camera.
  const densePlanar =
    usedGroups.size >= SHOWCASE_FLOOR.groups &&
    customDensity >= SHOWCASE_FLOOR.customPerSecond &&
    effectTypes.size >= SHOWCASE_FLOOR.effects;
  if (!camera && !densePlanar) {
    warn(
      "showcase_camera_missing",
      "Showcase structure: no camera2d affects a visible clip or scene group with transform.depthPx. See serein: camera push across depth planes. Set the camera and layer depth, then preview the framing."
    );
  }
  if (coverage < MIN_COVERAGE) {
    warn(
      "showcase_layer_density_low",
      `Showcase structure: at least ${MIN_LAYERS} concurrent visual clips cover ${Math.round(coverage * 100)}% of the first-to-last visible span (target ${MIN_COVERAGE * 100}%). See prism: layered plates and light. Build bed, midground and foreground across the scene. Groups, adjustments, audio, hidden or empty clips do not count. This static proxy does not judge occlusion, rendered depth or aesthetic quality.`
    );
  }
  if (usedGroups.size < SHOWCASE_FLOOR.groups) {
    warn(
      "showcase_scene_group_density_low",
      `Scene-group gap: ${usedGroups.size} active groups, floor ${SHOWCASE_FLOOR.groups}, example median ${SHOWCASE_TARGET.groups}. See voltra: scene groups direct each beat and nested hero rig.`
    );
  }
  if (customDensity < SHOWCASE_FLOOR.customPerSecond) {
    warn(
      "showcase_custom_animation_density_low",
      `Custom-motion gap: ${customCount} active changing animations over ${seconds.toFixed(2)} visible seconds (${customDensity.toFixed(2)}/s), floor ${SHOWCASE_FLOOR.customPerSecond.toFixed(2)}/s, example median ${SHOWCASE_TARGET.customPerSecond.toFixed(2)}/s. See tidewater: secondary curves and textured scene motion.`
    );
  }
  if (
    effectTypes.size < SHOWCASE_FLOOR.effects ||
    ![...effectTypes].some((type) => !FINISH_EFFECT_TYPES.includes(type))
  ) {
    warn(
      "showcase_effect_variety_low",
      `Effect-variety gap: ${effectTypes.size} enabled types, floor ${SHOWCASE_FLOOR.effects}, example median ${SHOWCASE_TARGET.effects}. A finish alone is insufficient. Add a non-finishing type such as glow or generator. See kite: repeater + glow on the logo, generator beds and stylize accents.`
    );
  }
  if (clipDensity < SHOWCASE_FLOOR.clipsPerSecond) {
    warn(
      "showcase_clip_density_low",
      `Clip-density gap: ${active.length} active clips over ${seconds.toFixed(2)} visible seconds (${clipDensity.toFixed(2)}/s), floor ${SHOWCASE_FLOOR.clipsPerSecond.toFixed(2)}/s, example median ${SHOWCASE_TARGET.clipsPerSecond.toFixed(2)}/s. See prism: overlapping plates, light and supporting geometry.`
    );
  }
  if (fastWithoutBlur.length) {
    warn(
      "showcase_motion_blur_missing",
      `Motion-blur gap: ${fastWithoutBlur.join(", ")} exceed ${FAST_POSITION_PER_SECOND} canvas widths/heights per second or ${FAST_SCALE_PER_SECOND} scale units per second without a positive shutter and at least two samples. See kite: blur on the fast logo move.`
    );
  }
  return issues;
}
