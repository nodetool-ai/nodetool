import type { ProductionProtectedInput, Shot } from "@nodetool-ai/protocol";
import { createTimeOrderedUuid, makeClip, makeTrack } from "./defaults.js";
import type { TimelineClip, TimelineTrack } from "./types.js";

export interface FinishedStoryboardDocument {
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  markers: [];
}
export interface ProducedTimelineIssue {
  code: "missing_element" | "duplicate_element" | "protected_source" | "protected_value" | "forbidden_generation" | "forbidden_transform" | "manual_conflict";
  shotId: string;
  elementId: string;
  message: string;
}
export interface FinishStoryboardInput {
  boardId: string;
  shots: readonly Shot[];
  width: number;
  height: number;
  current?: { tracks: TimelineTrack[]; clips: TimelineClip[] };
}

const identity = (shotId: string, elementId: string): string => `${shotId}/${elementId}`;
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const baseline = (clip: TimelineClip): string => JSON.stringify({
  currentAssetId: clip.currentAssetId,
  text: clip.textStyle?.text,
  color: clip.textStyle?.color ?? clip.shapeStyle?.fill,
  transform: clip.transform,
  startMs: clip.startMs,
  durationMs: clip.durationMs,
  animations: clip.animations
});

/** Validate actual layers, rather than a caller's description of intended edits. */
export function validateProducedTimeline(
  input: Pick<FinishStoryboardInput, "boardId" | "shots">,
  document: { tracks: TimelineTrack[]; clips: TimelineClip[] }
): ProducedTimelineIssue[] {
  const issues: ProducedTimelineIssue[] = [];
  const layers = new Map<string, TimelineClip[]>();
  for (const clip of document.clips) {
    if (clip.storyboardBoardId !== input.boardId || !clip.storyboardShotId || !clip.storyboardElementId) continue;
    const key = identity(clip.storyboardShotId, clip.storyboardElementId);
    layers.set(key, [...(layers.get(key) ?? []), clip]);
  }
  const tracks = new Map(document.tracks.map((track) => [track.id, track]));
  for (const shot of input.shots) {
    const protectedInputs = new Map((shot.production?.protected_inputs ?? []).map((value) => [value.id, value]));
    for (const element of shot.graphics?.elements ?? []) {
      const clips = layers.get(identity(shot.id, element.id)) ?? [];
      const issue = (code: ProducedTimelineIssue["code"], message: string): void => {
        issues.push({ code, shotId: shot.id, elementId: element.id, message });
      };
      if (clips.length === 0) { issue("missing_element", `Missing ${shot.id}/${element.id}.`); continue; }
      if (clips.length !== 1) { issue("duplicate_element", `Duplicate ${shot.id}/${element.id}.`); continue; }
      const clip = clips[0];
      if (clip.hidden || clip.opacity === 0 || clip.durationMs <= 0 || !tracks.has(clip.trackId) || tracks.get(clip.trackId)?.visible === false) {
        issue("missing_element", `${element.id} must be visible.`);
      }
      const protection = element.protected_input_id ? protectedInputs.get(element.protected_input_id) : undefined;
      if (element.protected_input_id && !protection) {
        issue("protected_source", `Unknown protected input ${element.protected_input_id}.`);
      }
      const assetId = protection?.asset_id ?? element.asset_id;
      if (element.kind === "asset" && (!assetId || clip.mediaType !== "image" || clip.currentAssetId !== assetId)) {
        issue("protected_source", `${element.id} must use original asset ${assetId ?? "(unresolved)"}.`);
      }
      if (element.kind === "asset" && (clip.sourceType !== "imported" || clip.bindingKind || clip.sourceClipId || clip.versions.some((version) => version.status === "success"))) {
        issue("forbidden_generation", `${element.id} cannot use a generative source.`);
      }
      if (element.kind === "text" && (clip.mediaType !== "text" || clip.textStyle?.text !== (protection?.value ?? element.text))) {
        issue("protected_value", `${element.id} must keep exact copy.`);
      }
      if (protection?.kind === "brand_color" && (clip.shapeStyle?.fill ?? clip.textStyle?.color) !== protection.value) {
        issue("protected_value", `${element.id} must keep exact brand color.`);
      }
      if (protection) validateTransforms(clip, protection, issue);
    }
  }
  return issues;
}

function validateTransforms(
  clip: TimelineClip,
  protection: ProductionProtectedInput,
  issue: (code: ProducedTimelineIssue["code"], message: string) => void
): void {
  const allowed = new Set(protection.allowed_transformations);
  const transform = clip.transform;
  const forbidden = (operation: ProductionProtectedInput["allowed_transformations"][number], active: boolean): void => {
    if (active && !allowed.has(operation)) issue("forbidden_transform", `${operation} is forbidden for ${protection.id}.`);
  };
  forbidden("position", !!transform && (transform.position.x !== 0 || transform.position.y !== 0));
  forbidden("scale", !!transform && (transform.scale.x !== 1 || transform.scale.y !== 1));
  forbidden("rotate", !!transform && (transform.rotation !== 0 || !!transform.rotationX || !!transform.rotationY));
  forbidden("opacity", clip.opacity !== undefined && clip.opacity !== 1);
  forbidden("mask", !!clip.matte);
  for (const animation of clip.animations ?? []) {
    if (animation.enabled === false) continue;
    if (animation.preset === "fade") forbidden("opacity", true);
    else if (animation.preset === "slide") { forbidden("opacity", true); forbidden("position", true); }
    else if (animation.preset === "pop") { forbidden("opacity", true); forbidden("scale", true); }
    else issue("forbidden_transform", `Animation ${animation.preset} has no proven protected transformation policy.`);
  }
}

/** Deterministic editable composition. Reruns preserve manually changed placement/timing. */
export function materializeStoryboard(input: FinishStoryboardInput): {
  document: FinishedStoryboardDocument;
  durationMs: number;
  validation: ProducedTimelineIssue[];
} {
  const current = input.current ?? { tracks: [], clips: [] };
  const existing = new Map<string, TimelineClip>();
  const conflicts: ProducedTimelineIssue[] = [];
  for (const clip of current.clips) {
    if (clip.storyboardBoardId !== input.boardId || !clip.storyboardShotId || !clip.storyboardElementId) continue;
    const key = identity(clip.storyboardShotId, clip.storyboardElementId);
    if (existing.has(key)) conflicts.push({ code: "duplicate_element", shotId: clip.storyboardShotId, elementId: clip.storyboardElementId, message: `Duplicate owned layer ${key}.` });
    existing.set(key, clip);
  }
  const foreignClips = current.clips.filter((clip) => clip.storyboardBoardId !== input.boardId);
  const tracks = current.tracks.filter((track) => foreignClips.some((clip) => clip.trackId === track.id));
  const clips: TimelineClip[] = [...foreignClips];
  let startMs = 0;
  for (const shot of [...input.shots].sort((a, b) => a.index - b.index)) {
    const durationMs = Math.max(1, (shot.duration_seconds ?? 4) * 1000);
    const protectedInputs = new Map((shot.production?.protected_inputs ?? []).map((value) => [value.id, value]));
    for (const [index, element] of (shot.graphics?.elements ?? []).entries()) {
      const key = identity(shot.id, element.id);
      const previous = existing.get(key);
      const track = current.tracks.find((value) => value.id === previous?.trackId) ?? makeTrack({ type: "overlay", name: `${shot.slug ?? shot.id}: ${element.id}`, index: tracks.length });
      if (!tracks.some((value) => value.id === track.id)) tracks.push({ ...track, index: tracks.length });
      const protection = element.protected_input_id ? protectedInputs.get(element.protected_input_id) : undefined;
      const isBackground = element.kind === "shape" && element.id === "background";
      const y = element.role === "product" ? 0.42 : element.role === "logo" ? 0.1 : element.role === "headline" ? 0.18 : element.role === "cta" ? 0.84 : 0.66 + (index % 2) * 0.1;
      const clip = makeClip({
        id: previous?.id ?? createTimeOrderedUuid(), trackId: track.id, name: element.id,
        startMs, durationMs, mediaType: element.kind === "asset" ? "image" : element.kind,
        sourceType: "imported", status: "generated", versions: [],
        storyboardBoardId: input.boardId, storyboardShotId: shot.id,
        storyboardElementId: element.id, storyboardElementRole: element.role,
        currentAssetId: element.kind === "asset" ? protection?.asset_id ?? element.asset_id : undefined,
        transform: isBackground ? undefined : { position: { x: 0, y: (y - 0.5) * input.height }, scale: { x: element.role === "logo" ? 0.18 : element.kind === "asset" ? 0.65 : 1, y: element.role === "logo" ? 0.18 : element.kind === "asset" ? 0.65 : 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 } },
        textStyle: element.kind === "text" ? { text: protection?.value ?? element.text ?? "", fontSizePx: element.role === "price" ? input.width * 0.12 : input.width * 0.065, fontWeight: 600, color: "#FFFFFF", align: "center", maxWidthFrac: 0.85 } : undefined,
        shapeStyle: element.kind === "shape" ? { kind: "rectangle", fill: protection?.kind === "brand_color" ? protection.value : "#21263A", x: isBackground ? 0 : 0.12, y: isBackground ? 0 : 0.74, width: isBackground ? 1 : 0.76, height: isBackground ? 1 : 0.008 } : undefined,
        animations: isBackground ? [] : [{ id: previous?.animations?.[0]?.id ?? createTimeOrderedUuid(), role: "in", preset: "fade", durationMs: 400, delayMs: 80 * index }]
      });
      clip.storyboardMaterializationBaseline = baseline(clip);
      if (previous) {
        let prior: Record<string, unknown> | undefined;
        try { prior = previous.storyboardMaterializationBaseline ? JSON.parse(previous.storyboardMaterializationBaseline) as Record<string, unknown> : undefined; } catch { /* Unrecognized ownership is an explicit conflict below. */ }
        if (!prior) conflicts.push({ code: "manual_conflict", shotId: shot.id, elementId: element.id, message: `Layer ${key} has no valid materializer baseline.` });
        else {
          if (!same(previous.currentAssetId, prior.currentAssetId) || !same(previous.textStyle?.text, prior.text)) conflicts.push({ code: "manual_conflict", shotId: shot.id, elementId: element.id, message: `Source or exact copy was manually changed on ${key}.` });
          if (!same(previous.transform, prior.transform)) clip.transform = previous.transform;
          if (!same(previous.startMs, prior.startMs)) clip.startMs = previous.startMs;
          if (!same(previous.durationMs, prior.durationMs)) clip.durationMs = previous.durationMs;
          if (!same(previous.animations, prior.animations)) clip.animations = previous.animations;
        }
      }
      clips.push(clip);
    }
    startMs += durationMs;
  }
  const document: FinishedStoryboardDocument = { tracks, clips, markers: [] };
  return { document, durationMs: Math.max(startMs, ...clips.map((clip) => clip.startMs + clip.durationMs)), validation: [...conflicts, ...validateProducedTimeline(input, document)] };
}
