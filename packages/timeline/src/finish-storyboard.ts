import { resolveEffectiveProductionRequirement, type StoryboardMotionDesign, type ProductionRequirement, type ProductionProtectedInput, type Shot } from "@nodetool-ai/protocol";
import { createTimeOrderedUuid, makeClip, makeTrack } from "./defaults.js";
import { resolveShotSource } from "./storyboard.js";
import { isKnownShapeKind } from "./types.js";
import type { TimelineClip, TimelineTrack, TimelineMarker } from "./types.js";

export interface FinishedStoryboardDocument {
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  markers: TimelineMarker[];
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
  production?: ProductionRequirement;
  motionDesign?: StoryboardMotionDesign;
  current?: { tracks: TimelineTrack[]; clips: TimelineClip[]; markers?: TimelineMarker[] };
}

const identity = (shotId: string, elementId: string): string => `${shotId}/${elementId}`;
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const baseline = (clip: TimelineClip): string => JSON.stringify({
  currentAssetId: clip.currentAssetId,
  textStyle: clip.textStyle,
  shapeStyle: clip.shapeStyle,
  opacity: clip.opacity,
  matte: clip.matte,
  crop: clip.crop,
  effects: clip.effects,
  parentId: clip.parentId,
  text: clip.textStyle?.text,
  color: clip.textStyle?.color ?? clip.shapeStyle?.fill,
  transform: clip.transform,
  startMs: clip.startMs,
  durationMs: clip.durationMs,
  animations: clip.animations
});

/** Validate actual layers, rather than a caller's description of intended edits. */
export function validateProducedTimeline(
  input: Pick<FinishStoryboardInput, "boardId" | "shots" | "production">,
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
    const protectedInputs = new Map((resolveEffectiveProductionRequirement(input.production, shot.production)?.protected_inputs ?? []).map((value) => [value.id, value]));
    const referencedProtection = new Set((shot.graphics?.elements ?? []).map((element) => element.protected_input_id));
    for (const protection of protectedInputs.values()) {
      if (!referencedProtection.has(protection.id)) issues.push({ code: "missing_element", shotId: shot.id, elementId: protection.id, message: `Protected input ${protection.id} has no editable visible graphics element.` });
    }
    for (const element of shot.graphics?.elements ?? []) {
      const clips = layers.get(identity(shot.id, element.id)) ?? [];
      const issue = (code: ProducedTimelineIssue["code"], message: string): void => {
        issues.push({ code, shotId: shot.id, elementId: element.id, message });
      };
      if (clips.length === 0) { issue("missing_element", `Missing ${shot.id}/${element.id}.`); continue; }
      if (clips.length !== 1) { issue("duplicate_element", `Duplicate ${shot.id}/${element.id}.`); continue; }
      const clip = clips[0];
      if (clip.hidden || clip.opacity === 0 || (clip.transform && (!Number.isFinite(clip.transform.scale.x) || !Number.isFinite(clip.transform.scale.y) || clip.transform.scale.x === 0 || clip.transform.scale.y === 0)) || clip.durationMs <= 0 || !tracks.has(clip.trackId) || tracks.get(clip.trackId)?.visible === false) {
        issue("missing_element", `${element.id} must be visible.`);
      }
      if (element.kind === "shape" && (!clip.shapeStyle || !isKnownShapeKind(clip.shapeStyle.kind))) issue("missing_element", `${element.id} has unsupported or missing visible shape geometry.`);
      const protection = element.protected_input_id ? protectedInputs.get(element.protected_input_id) : undefined;
      if (element.protected_input_id && !protection) {
        issue("protected_source", `Unknown protected input ${element.protected_input_id}.`);
      }
      const assetId = protection?.asset_id ?? element.asset_id;
      if (protection && ["product", "logo", "source_asset"].includes(protection.kind) && (element.kind !== "asset" || clip.mediaType !== "image" || clip.currentAssetId !== protection.asset_id)) issue("protected_source", `${protection.id} requires its original separately editable image.`);
      if (protection?.kind === "exact_text" && (element.kind !== "text" || clip.mediaType !== "text" || clip.textStyle?.text !== protection.value)) issue("protected_value", `${protection.id} requires its exact editable text.`);
      if (protection && tracks.get(clip.trackId)?.effects?.length) issue("forbidden_transform", `Track effects on ${protection.id} cannot be proven faithful.`);
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
  forbidden("crop", !!clip.crop);
  if (clip.parentId || clip.effects?.length) issue("forbidden_transform", `Inherited transforms or effects on ${protection.id} cannot be proven faithful by this materializer.`);
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
    const protectedInputs = new Map((resolveEffectiveProductionRequirement(input.production, shot.production)?.protected_inputs ?? []).map((value) => [value.id, value]));
    const source = resolveShotSource(shot, input.production);
    if (!source) {
      conflicts.push({ code: "missing_element", shotId: shot.id, elementId: "$source", message: `Shot ${shot.id} has no source allowed by its media strategy.` });
    }
    const elements = [...(shot.graphics?.elements ?? [])];
    if (source && source.kind !== "graphics") {
      elements.unshift({ id: "$source", kind: "asset", asset_id: source.assetId });
    }
    for (const [index, element] of elements.entries()) {
      const key = identity(shot.id, element.id);
      const previous = existing.get(key);
      const track = current.tracks.find((value) => value.id === previous?.trackId) ?? makeTrack({ type: "overlay", name: `${shot.slug ?? shot.id}: ${element.id}`, index: tracks.length });
      if (!tracks.some((value) => value.id === track.id)) tracks.push({ ...track, index: tracks.length });
      const protection = element.protected_input_id ? protectedInputs.get(element.protected_input_id) : undefined;
      const isBackground = element.kind === "shape" && element.id === "background";
      const y = element.role === "product" ? 0.42 : element.role === "logo" ? 0.1 : element.role === "headline" ? 0.18 : element.role === "cta" ? 0.84 : 0.66 + (index % 2) * 0.1;
      const clip = makeClip({
        id: previous?.id ?? createTimeOrderedUuid(), trackId: track.id, name: element.id,
        startMs, durationMs, mediaType: element.id === "$source" && source?.kind === "video" ? "video" : element.kind === "asset" ? "image" : element.kind,
        sourceType: "imported", status: "generated", versions: [],
        storyboardBoardId: input.boardId, storyboardShotId: shot.id,
        storyboardElementId: element.id, storyboardElementRole: element.role,
        currentAssetId: element.kind === "asset" ? protection?.asset_id ?? element.asset_id : undefined,
        transform: isBackground ? undefined : { position: { x: 0, y: (y - 0.5) * input.height }, scale: { x: element.role === "logo" ? 0.18 : element.kind === "asset" ? 0.65 : 1, y: element.role === "logo" ? 0.18 : element.kind === "asset" ? 0.65 : 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 } },
        textStyle: element.kind === "text" ? { text: protection?.value ?? element.text ?? "", fontSizePx: element.role === "price" ? input.width * 0.12 : input.width * 0.065, fontWeight: 600, color: "#FFFFFF", align: "center", maxWidthFrac: 0.85 } : undefined,
        shapeStyle: element.kind === "shape" ? { kind: "rect", fill: protection?.kind === "brand_color" ? protection.value : "#21263A", x: isBackground ? 0 : 0.12, y: isBackground ? 0 : 0.74, width: isBackground ? 1 : 0.76, height: isBackground ? 1 : 0.008 } : undefined,
        animations: isBackground ? [] : [{ id: previous?.animations?.[0]?.id ?? createTimeOrderedUuid(), role: "in", preset: "fade", durationMs: 400, delayMs: 80 * index }]
      });
      clip.storyboardMaterializationBaseline = baseline(clip);
      if (previous) {
        let prior: Record<string, unknown> | undefined;
        try { prior = previous.storyboardMaterializationBaseline ? JSON.parse(previous.storyboardMaterializationBaseline) as Record<string, unknown> : undefined; } catch { /* Unrecognized ownership is an explicit conflict below. */ }
        if (!prior) conflicts.push({ code: "manual_conflict", shotId: shot.id, elementId: element.id, message: `Layer ${key} has no valid materializer baseline.` });
        else {
          if (!same(previous.currentAssetId, prior.currentAssetId) || !same(previous.textStyle?.text, prior.text) || !same(previous.textStyle?.color ?? previous.shapeStyle?.fill, prior.color) || !same(previous.textStyle, prior.textStyle) || !same(previous.shapeStyle, prior.shapeStyle) || !same(previous.opacity, prior.opacity) || !same(previous.matte, prior.matte) || !same(previous.crop, prior.crop) || !same(previous.effects, prior.effects) || !same(previous.parentId, prior.parentId)) conflicts.push({ code: "manual_conflict", shotId: shot.id, elementId: element.id, message: `Source or exact copy was manually changed on ${key}.` });
          if (!same(previous.transform, prior.transform)) clip.transform = previous.transform;
          if (!same(previous.startMs, prior.startMs)) clip.startMs = previous.startMs;
          if (!same(previous.durationMs, prior.durationMs)) clip.durationMs = previous.durationMs;
          if (!same(previous.animations, prior.animations)) conflicts.push({ code: "manual_conflict", shotId: shot.id, elementId: element.id, message: `Animations were manually changed on ${key}.` });
        }
      }
      clips.push(clip);
    }
    startMs += durationMs;
  }
  // These semantic directions select existing Timeline animations, never another animation model.
  for (const transition of input.motionDesign?.transitions ?? []) {
    const direction = transition.direction?.trim().toLowerCase() ?? "fade";
    if (direction === "cut") continue;
    if (direction !== "fade") {
      conflicts.push({ code: "forbidden_transform", shotId: transition.to_shot_id, elementId: "$transition", message: `Unsupported transition direction ${direction}. Use cut or fade. Crossfade requires overlapping composition and is not supported by this materializer.` });
      continue;
    }
    const outgoing = clips.filter((clip) => clip.storyboardBoardId === input.boardId && clip.storyboardShotId === transition.from_shot_id);
    const incoming = clips.filter((clip) => clip.storyboardBoardId === input.boardId && clip.storyboardShotId === transition.to_shot_id);
    for (const clip of outgoing) clip.animations = [...(clip.animations ?? []), { id: `${clip.id}:cut-out`, role: "out", preset: "fade", durationMs: 300 }];
    for (const clip of incoming) clip.animations = [...(clip.animations ?? []), { id: `${clip.id}:cut-in`, role: "in", preset: "fade", durationMs: 300 }];
  }
  for (const continuity of input.motionDesign?.continuities ?? []) {
    const matching = continuity.shot_ids.map((shotId) => clips.find((clip) => clip.storyboardBoardId === input.boardId && clip.storyboardShotId === shotId && clip.storyboardElementId === continuity.id));
    if (matching.some((clip) => !clip)) {
      conflicts.push({ code: "missing_element", shotId: continuity.shot_ids[0] ?? "", elementId: continuity.id, message: `Continuity ${continuity.id} must name a graphics element present in every referenced shot.` });
      continue;
    }
    const first = matching[0]!;
    for (const [index, clip] of matching.entries()) {
      if (!clip) continue;
      // A continuous device retains placement and does not restart its entrance at each cut.
      if (index > 0) {
        const previous = existing.get(identity(clip.storyboardShotId ?? "", clip.storyboardElementId ?? ""));
        const owned = previous?.storyboardMaterializationBaseline ? JSON.parse(previous.storyboardMaterializationBaseline) as Record<string, unknown> : undefined;
        if (previous && owned && !same(previous.transform, owned.transform) && !same(previous.transform, first.transform)) {
          conflicts.push({ code: "manual_conflict", shotId: clip.storyboardShotId ?? "", elementId: continuity.id, message: `Manual placement on continuity ${continuity.id} conflicts with shared placement.` });
        } else clip.transform = first.transform ? structuredClone(first.transform) : undefined;
        clip.animations = (clip.animations ?? []).filter((animation) => animation.role !== "in");
      }
      if (index < matching.length - 1) clip.animations = (clip.animations ?? []).filter((animation) => animation.role !== "out");
    }
  }
  for (const clip of clips) {
    if (clip.storyboardBoardId !== input.boardId || !clip.storyboardMaterializationBaseline) continue;
    const owned = JSON.parse(clip.storyboardMaterializationBaseline) as Record<string, unknown>;
    owned.animations = clip.animations;
    clip.storyboardMaterializationBaseline = JSON.stringify(owned);
  }
  const document: FinishedStoryboardDocument = { tracks, clips, markers: current.markers ?? [] };
  return { document, durationMs: Math.max(startMs, ...clips.map((clip) => clip.startMs + clip.durationMs)), validation: [...conflicts, ...validateProducedTimeline(input, document)] };
}
