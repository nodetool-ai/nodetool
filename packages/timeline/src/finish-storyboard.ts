import { isRecord, resolveEffectiveProductionRequirement, type StoryboardMotionDesign, type ProductionRequirement, type ProductionProtectedInput, type Shot } from "@nodetool-ai/protocol";
import { createTimeOrderedUuid, makeClip, makeTrack } from "./defaults.js";
import { moveTrackOrder } from "./trackOrder.js";
import { resolveShotSource } from "./storyboard.js";
import { isKnownShapeKind } from "./types.js";
import { buildTransformMatrix, IDENTITY_TRANSFORM } from "./render/transform.js";
import { compileClipAnimations } from "./animation/compile.js";
import type { TimelineClip, TimelineSequence } from "./types.js";

export type FinishedStoryboardDocument = Partial<TimelineSequence> & Pick<TimelineSequence, "tracks" | "clips" | "markers">;
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
  current?: Partial<TimelineSequence> & Pick<TimelineSequence, "tracks" | "clips">;
}

function parseBaseline(value: string | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch { return undefined; }
}

const identity = (shotId: string, elementId: string): string => `${shotId}/${elementId}`;
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const baseline = (clip: TimelineClip): string => JSON.stringify({
  mediaType: clip.mediaType,
  blendMode: clip.blendMode ?? "normal",
  currentAssetId: clip.currentAssetId,
  textStyle: clip.textStyle,
  shapeStyle: clip.shapeStyle,
  opacity: clip.opacity,
  hidden: clip.hidden,
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
  input: Pick<FinishStoryboardInput, "boardId" | "shots" | "production" | "width" | "height">,
  document: Pick<TimelineSequence, "tracks" | "clips" | "camera2d" | "mediaTracks">
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
      if (document.camera2d != null || (document.mediaTracks != null && (!Array.isArray(document.mediaTracks) || document.mediaTracks.length > 0))) {
        issues.push({ code: "forbidden_transform", shotId: shot.id, elementId: protection.id, message: `Global camera or media tracking transforms on ${protection.id} cannot be proven faithful. Remove these transforms before production validation.` });
      }
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
      if (!intersectsCanvas(clip, input.width, input.height)) {
        issue("missing_element", `${element.id} is outside the canvas. Move the layer into view before finishing.`);
      }
      if (element.kind === "shape" && clip.mediaType !== "shape") issue("protected_value", `${element.id} requires its separately editable shape.`);
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

/** A contain-fit source cannot exceed this canvas-sized envelope. This checks
 * placement, not source alpha, text glyphs or occlusion by other layers. */
function intersectsCanvas(clip: TimelineClip, width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false;
  const transform = clip.transform ?? IDENTITY_TRANSFORM;
  let minOffsetX = 0, maxOffsetX = 0, minOffsetY = 0, maxOffsetY = 0;
  let scaleX = 1, scaleY = 1;
  for (const animation of compileClipAnimations(clip.animations, clip.durationMs, { width, height })) {
    for (const curve of animation.curves) {
      if (curve.property === "opacity") continue;
      // Unknown or overshooting curves require sampling actual source geometry.
      if (curve.keyframes.some((keyframe) => keyframe.easing && !["linear", "easeIn", "easeOut", "easeInOut"].includes(keyframe.easing))) return true;
      const values = curve.keyframes.map((keyframe) => keyframe.value);
      if (curve.property === "offsetX") { minOffsetX += Math.min(0, ...values); maxOffsetX += Math.max(0, ...values); }
      else if (curve.property === "offsetY") { minOffsetY += Math.min(0, ...values); maxOffsetY += Math.max(0, ...values); }
      else if (curve.property === "scale") { const maximum = Math.max(1, ...values); scaleX *= maximum; scaleY *= maximum; }
      else if (curve.property === "scaleX") scaleX *= Math.max(1, ...values);
      else if (curve.property === "scaleY") scaleY *= Math.max(1, ...values);
      else return true;
    }
  }
  const matrix = buildTransformMatrix({ ...transform, scale: { x: transform.scale.x * scaleX, y: transform.scale.y * scaleY } }, { x: 1, y: 1 }, width, height);
  // Include the pivot because shrinking a source can move it toward that pivot.
  const xs = [Math.min(-1, (transform.anchor.x - 0.5) * 2), Math.max(1, (transform.anchor.x - 0.5) * 2)];
  const ys = [Math.min(-1, (transform.anchor.y - 0.5) * 2), Math.max(1, (transform.anchor.y - 0.5) * 2)];
  const corners = xs.flatMap((x) => ys.map((y) => {
    const w = matrix[3] * x + matrix[7] * y + matrix[15];
    return { x: (matrix[0] * x + matrix[4] * y + matrix[12]) / w, y: (matrix[1] * x + matrix[5] * y + matrix[13]) / w, w };
  }));
  // Crossing the perspective plane needs actual source bounds, not this envelope.
  if (corners.some((point) => point.w <= 0)) return true;
  if (corners.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return false;
  return Math.max(...corners.map((point) => point.x)) + 2 * maxOffsetX / width > -1 && Math.min(...corners.map((point) => point.x)) + 2 * minOffsetX / width < 1
    && Math.max(...corners.map((point) => point.y)) - 2 * minOffsetY / height > -1 && Math.min(...corners.map((point) => point.y)) - 2 * maxOffsetY / height < 1;
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
  if (clip.blendMode && clip.blendMode !== "normal") issue("forbidden_transform", `Color-changing blending on ${protection.id} cannot preserve protected values.`);
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
  const unsupported = [current.camera2d != null && "camera", current.source != null && "code-authored source", current.mediaTracks != null && (!Array.isArray(current.mediaTracks) || current.mediaTracks.length > 0) && "media tracking"].filter(Boolean);
  if (unsupported.length > 0) {
    return {
      document: { ...current, markers: current.markers ?? [] },
      durationMs: Math.max(0, ...current.clips.map((clip) => clip.startMs + clip.durationMs)),
      validation: [{ code: "manual_conflict", shotId: "", elementId: "", message: `Finishing cannot reconcile ${unsupported.join(", ")}. Use a separate Timeline or explicitly remove these features before finishing again.` }]
    };
  }
  const existing = new Map<string, TimelineClip>();
  const conflicts: ProducedTimelineIssue[] = [];
  for (const clip of current.clips) {
    if (clip.storyboardBoardId !== input.boardId || !clip.storyboardShotId || !clip.storyboardElementId) continue;
    const key = identity(clip.storyboardShotId, clip.storyboardElementId);
    if (existing.has(key)) conflicts.push({ code: "duplicate_element", shotId: clip.storyboardShotId, elementId: clip.storyboardElementId, message: `Duplicate owned layer ${key}.` });
    existing.set(key, clip);
  }
  const previousKeys = new Set(current.storyboardMaterializations?.find((entry) => entry.boardId === input.boardId)?.elementKeys ?? []);
  const foreignClips = current.clips.filter((clip) => clip.storyboardBoardId !== input.boardId);
  const ownedTrackIds = new Set(current.clips.filter((clip) => clip.storyboardBoardId === input.boardId).map((clip) => clip.trackId));
  const tracks = current.tracks.filter((track) => !ownedTrackIds.has(track.id) || foreignClips.some((clip) => clip.trackId === track.id)).map((track) => ({ ...track }));
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
      if (!previous && previousKeys.has(key)) conflicts.push({ code: "manual_conflict", shotId: shot.id, elementId: element.id, message: `Owned layer ${key} was manually deleted. Restore it before finishing again.` });
      const track = current.tracks.find((value) => value.id === previous?.trackId) ?? makeTrack({ type: "overlay", name: `${shot.slug ?? shot.id}: ${element.id}`, index: tracks.length });
      if (!tracks.some((value) => value.id === track.id)) tracks.push({ ...track, index: previous ? track.index : Math.max(-1, ...tracks.map((value) => value.index)) + 1 });
      const protection = element.protected_input_id ? protectedInputs.get(element.protected_input_id) : undefined;
      const creativeDirection = shot.graphics?.direction?.trim().toLowerCase();
      const bold = creativeDirection === "bold editorial rhythm";
      const quiet = creativeDirection === "quiet premium composition";
      const allowedMotion = !protection || protection.allowed_transformations.includes("opacity");
      const slideAllowed = allowedMotion && (!protection || protection.allowed_transformations.includes("position"));
      const isBackground = element.kind === "shape" && element.id === "background";
      const priceIntent = element.role === "price" ? element.direction?.trim().toLowerCase() : undefined;
      const priceY = priceIntent === "superseded price" ? 0.65 : priceIntent === "current price" ? 0.76 : undefined;
      const y = priceY ?? (element.role === "product" ? 0.42 : element.role === "logo" ? 0.1 : element.role === "headline" ? 0.18 : element.role === "cta" ? 0.84 : 0.66 + (index % 2) * 0.1);
      const clip = makeClip({
        id: previous?.id ?? createTimeOrderedUuid(), trackId: track.id, name: element.id,
        startMs, durationMs, mediaType: element.id === "$source" && source?.kind === "video" ? "video" : element.kind === "asset" ? "image" : element.kind,
        sourceType: "imported", status: "generated", versions: [],
        storyboardBoardId: input.boardId, storyboardShotId: shot.id,
        storyboardElementId: element.id, storyboardElementRole: element.role,
        currentAssetId: element.kind === "asset" ? protection?.asset_id ?? element.asset_id : undefined,
        transform: isBackground ? undefined : { position: { x: 0, y: (y - 0.5) * input.height }, scale: { x: element.role === "logo" ? 0.18 : element.kind === "asset" ? 0.65 : 1, y: element.role === "logo" ? 0.18 : element.kind === "asset" ? 0.65 : 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 } },
        textStyle: element.kind === "text" ? { text: protection?.value ?? element.text ?? "", fontSizePx: element.role === "price" ? input.width * (priceIntent === "superseded price" ? 0.055 : 0.12) : input.width * 0.065, fontWeight: 600, color: "#FFFFFF", align: "center", maxWidthFrac: 0.85 } : undefined,
        shapeStyle: element.kind === "shape" ? { kind: "rect", fill: protection?.kind === "brand_color" ? protection.value : "#21263A", x: isBackground ? 0 : 0.12, y: isBackground ? 0 : 0.74, width: isBackground ? 1 : 0.76, height: isBackground ? 1 : 0.008 } : undefined,
        animations: isBackground || !allowedMotion ? [] : [{ id: previous?.animations?.[0]?.id ?? createTimeOrderedUuid(), role: "in", preset: bold && slideAllowed ? "slide" : "fade", durationMs: quiet ? 700 : 400, delayMs: (quiet ? 40 : 80) * index, params: bold && slideAllowed ? { direction: "up", distance: 0.12 } : undefined }]
      });
      clip.storyboardMaterializationBaseline = baseline(clip);
      if (previous) {
        const prior = parseBaseline(previous.storyboardMaterializationBaseline);
        if (!prior) conflicts.push({ code: "manual_conflict", shotId: shot.id, elementId: element.id, message: `Layer ${key} has no valid materializer baseline.` });
        else {
          if (!same(previous.blendMode ?? "normal", prior.blendMode ?? "normal") || !same(previous.mediaType, prior.mediaType ?? clip.mediaType) || !same(previous.currentAssetId, prior.currentAssetId) || !same(previous.textStyle?.text, prior.text) || !same(previous.textStyle?.color ?? previous.shapeStyle?.fill, prior.color) || !same(previous.textStyle, prior.textStyle) || !same(previous.shapeStyle, prior.shapeStyle) || !same(previous.opacity, prior.opacity) || !same(previous.hidden, prior.hidden) || !same(previous.matte, prior.matte) || !same(previous.crop, prior.crop) || !same(previous.effects, prior.effects) || !same(previous.parentId, prior.parentId)) conflicts.push({ code: "manual_conflict", shotId: shot.id, elementId: element.id, message: `Source or exact copy was manually changed on ${key}.` });
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
  // New backgrounds belong beneath overlays. Existing track order is a user-owned edit.
  for (const clip of clips) {
    if (clip.storyboardBoardId !== input.boardId || !["background", "$source"].includes(clip.storyboardElementId ?? "") || existing.has(identity(clip.storyboardShotId ?? "", clip.storyboardElementId ?? ""))) continue;
    const order = moveTrackOrder(tracks, clip.trackId, { toIndex: tracks.length - 1 });
    const indices = new Map(order.map((id, index) => [id, index]));
    for (const track of tracks) {
      const index = indices.get(track.id);
      if (index === undefined) throw new Error(`Track ${track.id} is missing from composition order.`);
      track.index = index;
    }
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
    const first = matching[0];
    if (!first) continue;
    for (const [index, clip] of matching.entries()) {
      if (!clip) continue;
      // A continuous device retains placement and does not restart its entrance at each cut.
      if (index > 0) {
        const previous = existing.get(identity(clip.storyboardShotId ?? "", clip.storyboardElementId ?? ""));
        const owned = parseBaseline(previous?.storyboardMaterializationBaseline);
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
    const owned = parseBaseline(clip.storyboardMaterializationBaseline);
    if (!owned) continue;
    owned.animations = clip.animations;
    clip.storyboardMaterializationBaseline = JSON.stringify(owned);
  }
  const document: FinishedStoryboardDocument = { ...current, tracks, clips, markers: current.markers ?? [], storyboardMaterializations: [...(current.storyboardMaterializations ?? []).filter((entry) => entry.boardId !== input.boardId), { boardId: input.boardId, elementKeys: clips.filter((clip) => clip.storyboardBoardId === input.boardId).map((clip) => identity(clip.storyboardShotId!, clip.storyboardElementId!)) }] };
  return { document, durationMs: Math.max(startMs, ...clips.map((clip) => clip.startMs + clip.durationMs)), validation: [...conflicts, ...validateProducedTimeline(input, document)] };
}
