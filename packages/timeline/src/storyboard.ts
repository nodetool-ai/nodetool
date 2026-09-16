/**
 * Storyboard → timeline assembly.
 *
 * The one mapping from a board's rendered shots to a timeline document, shared
 * by the web surface (`ui_storyboard_assemble_timeline`) and the server-side
 * `assemble_storyboard_timeline` agent tool, so a cut assembled headlessly is
 * the same cut the editor would have produced.
 *
 * Rendered shots become imported, asset-backed video clips laid end to end in
 * shot order, each as long as the footage it holds, and each stamped with
 * `storyboardBoardId`/`storyboardShotId` so a later shot revision can
 * round-trip into the cut. Every shot clip also gets an audio twin on its own
 * track (`shotAudioClip`), because the preview and the export mute video
 * elements and take sound only from audio clips. Narration and music become
 * draft text-to-audio clips on their own tracks — the timeline's generation
 * machinery renders them on demand.
 *
 * `buildStoryboardPreviewTimeline` is the same mapping for the in-editor
 * player, where a board that is only half rendered still has to play.
 */

import {
  productionCandidate,
  type ProductionCandidate,
  type ProductionGenerationSnapshot,
  type Shot
} from "@nodetool-ai/protocol";
import { createTimeOrderedUuid, makeClip, makeTrack } from "./defaults.js";
import {
  productionCandidateIdentityForDestination,
  type ProductionAuditionMap,
  type ProductionCandidateIdentity
} from "./production.js";
import { stableSerialize } from "./stableSerialize.js";
import type {
  ClipVersion as TimelineClipVersion,
  TimelineClip,
  TimelineTrack
} from "./types.js";

/** Clip length used for a shot that carries no duration. */
export const DEFAULT_SHOT_MS = 4000;

export interface StoryboardProductionResultRecord {
  readonly createdAt: string;
  readonly measuredDurationMs: number;
  readonly jobId?: string;
  readonly costCredits?: number;
}

interface StoryboardProductionCandidateRecord {
  readonly clip: NonNullable<Shot["clip"]>;
  readonly candidate: ProductionCandidate;
  readonly result: StoryboardProductionResultRecord;
}

export interface StoryboardProductionCandidateLanding {
  readonly identity: ProductionCandidateIdentity;
  readonly snapshot: ProductionGenerationSnapshot;
  readonly clip: NonNullable<Shot["clip"]>;
  readonly createdAt: string;
  readonly measuredDurationMs: number;
  readonly takeId?: string;
  readonly jobId?: string;
  readonly costCredits?: number;
}

/** Stable storyboard identity assigned before provider dispatch. */
export function storyboardProductionCandidateIdentity(
  batchId: string,
  shotId: string,
  variationIndex: number
): ProductionCandidateIdentity {
  return productionCandidateIdentityForDestination(
    "storyboard_shot",
    batchId,
    shotId,
    variationIndex
  );
}

function productionRecordOf(
  clip: NonNullable<Shot["clip"]> | null | undefined
): StoryboardProductionCandidateRecord | null {
  if (clip === null || clip === undefined) return null;
  const candidateValue =
    "production_candidate" in clip
      ? clip.production_candidate
      : undefined;
  const parsedCandidate = productionCandidate.safeParse(candidateValue);
  if (!parsedCandidate.success) return null;

  const resultValue =
    "production_result" in clip
      ? clip.production_result
      : undefined;
  if (
    resultValue === null ||
    typeof resultValue !== "object" ||
    !("createdAt" in resultValue) ||
    typeof resultValue.createdAt !== "string" ||
    !("measuredDurationMs" in resultValue) ||
    typeof resultValue.measuredDurationMs !== "number"
  ) {
    return null;
  }
  const jobId =
    "jobId" in resultValue && typeof resultValue.jobId === "string"
      ? resultValue.jobId
      : undefined;
  const costCredits =
    "costCredits" in resultValue && typeof resultValue.costCredits === "number"
      ? resultValue.costCredits
      : undefined;
  return {
    clip,
    candidate: parsedCandidate.data,
    result: {
      createdAt: resultValue.createdAt,
      measuredDurationMs: resultValue.measuredDurationMs,
      ...(jobId === undefined ? {} : { jobId }),
      ...(costCredits === undefined ? {} : { costCredits })
    }
  };
}

function storyboardCandidateForShot(
  shot: Shot,
  candidateId: string
): StoryboardProductionCandidateRecord | null {
  for (const clip of shot.clip_versions ?? []) {
    const record = productionRecordOf(clip);
    if (record?.candidate.candidateId === candidateId) return record;
  }
  return null;
}

/** Return storyboard video candidates in requested variation order. */
export function storyboardProductionCandidatesForShot(
  shot: Shot,
  batchId?: string
): ProductionCandidate[] {
  return (shot.clip_versions ?? [])
    .map((clip) => productionRecordOf(clip))
    .filter(
      (record): record is StoryboardProductionCandidateRecord =>
        record !== null &&
        (batchId === undefined || record.candidate.batchId === batchId)
    )
    .map((record) => record.candidate)
    .sort(
      (left, right) =>
        left.variationIndex - right.variationIndex ||
        left.candidateId.localeCompare(right.candidateId)
    );
}

/** Land a completed storyboard video as an inactive clip candidate. */
export function landStoryboardProductionCandidate(
  shot: Shot,
  landing: StoryboardProductionCandidateLanding
): Shot {
  const { identity, snapshot } = landing;
  if (
    identity.destinationKind !== "storyboard_shot" ||
    identity.destinationId !== shot.id
  ) {
    throw new Error("A storyboard candidate must land on its requested shot.");
  }
  if (
    snapshot.candidateId !== identity.candidateId ||
    snapshot.batchId !== identity.batchId ||
    snapshot.requestId !== identity.requestId ||
    snapshot.variationId !== identity.variationId ||
    snapshot.variationIndex !== identity.variationIndex ||
    snapshot.destinationId !== identity.destinationId ||
    snapshot.destinationKind !== identity.destinationKind
  ) {
    throw new Error("Storyboard candidate identity does not match its snapshot.");
  }
  const assetId = assetIdOf(landing.clip);
  if (assetId === undefined) {
    throw new Error("A ready storyboard candidate needs a persisted asset id.");
  }
  if (
    !Number.isFinite(landing.measuredDurationMs) ||
    landing.measuredDurationMs <= 0
  ) {
    throw new Error("A storyboard candidate needs a measured duration in milliseconds.");
  }

  const versions =
    shot.clip_versions ?? (shot.clip === null || shot.clip === undefined ? [] : [shot.clip]);
  const existing = versions
    .map((clip) => productionRecordOf(clip))
    .find((record) => record?.candidate.candidateId === identity.candidateId);
  if (existing !== undefined && existing !== null) {
    if (
      existing.candidate.requestId === identity.requestId &&
      existing.candidate.assetId === assetId &&
      stableSerialize(existing.candidate.snapshot) === stableSerialize(snapshot)
    ) {
      return shot;
    }
    throw new Error(
      `Candidate "${identity.candidateId}" already exists with different inputs.`
    );
  }

  const candidate: ProductionCandidate = {
    ...identity,
    status: "ready",
    assetId,
    takeId: landing.takeId ?? identity.candidateId,
    snapshot
  };
  const productionResult: StoryboardProductionResultRecord = {
    createdAt: landing.createdAt,
    measuredDurationMs: landing.measuredDurationMs,
    ...(landing.jobId === undefined ? {} : { jobId: landing.jobId }),
    ...(landing.costCredits === undefined
      ? {}
      : { costCredits: landing.costCredits })
  };
  const clip = {
    ...landing.clip,
    production_candidate: candidate,
    production_result: productionResult
  };
  return { ...shot, clip_versions: [...versions, clip] };
}

/**
 * Frame size for an aspect ratio, at a 1080px short edge.
 *
 * The one mapping from a board's `aspectRatio` to a sequence's width/height,
 * so the assemble button and the `assemble_storyboard_timeline` capability
 * create a timeline with the same frame. An unparseable ratio falls back to
 * 1920x1080.
 */
export function frameSizeForAspect(aspectRatio: string | null | undefined): {
  width: number;
  height: number;
} {
  const [w, h] = String(aspectRatio ?? "")
    .split(":")
    .map((part) => Number(part));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return { width: 1920, height: 1080 };
  }
  const short = 1080;
  const even = (n: number) => Math.round(n / 2) * 2;
  return w >= h
    ? { width: even((short * w) / h), height: short }
    : { width: short, height: even((short * h) / w) };
}

/** Track holding the sound that came with the shots' own rendered clips. */
export const SHOT_AUDIO_TRACK_NAME = "Shot Audio";

/**
 * The audio twin of a shot's video clip.
 *
 * A rendered shot carries its own sound — dialogue the video model spoke, room
 * tone, whatever the render produced — but every surface that plays a timeline
 * mutes its video elements and mixes audio clips only, so without a twin that
 * sound never reaches the cut. The twin points at the same asset, sits at the
 * same place, and shares a `linkId` with the video clip so the two move and
 * trim together.
 */
export function shotAudioClip(
  videoClip: TimelineClip,
  trackId: string
): TimelineClip {
  return makeClip({
    trackId,
    name: `${videoClip.name} (audio)`,
    startMs: videoClip.startMs,
    durationMs: videoClip.durationMs,
    mediaType: "audio",
    sourceType: "imported",
    status: "generated",
    currentAssetId: videoClip.currentAssetId,
    linkId: videoClip.linkId,
    storyboardBoardId: videoClip.storyboardBoardId,
    storyboardShotId: videoClip.storyboardShotId,
    versions: []
  });
}

export interface StoryboardAssemblyInput {
  /** Board id stamped onto each clip, linking the cut back to the board. */
  boardId: string;
  shots: Shot[];
  /** Voiceover script, laid across the full cut as one draft audio clip. */
  narration?: string | null;
  /** Score direction, laid across the full cut as one draft audio clip. */
  musicPrompt?: string | null;
}

export interface AssembledTimeline {
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  /** Total duration of the shot track in ms. */
  durationMs: number;
  /** Shots skipped because they have no persisted clip asset. */
  skippedShotIds: string[];
  /**
   * Shots whose place in the cut is not the length of the footage they hold.
   * Empty for a plain storyboard cut, which lays every shot down at its
   * rendered length; a jointly assembled cut fills it, because there the
   * words decide how long a shot runs.
   */
  trimmedShots: TrimmedShot[];
  /**
   * Shots laid down at a length other than the one they were directed at, and
   * what each was directed at. A model returns the length it returns: saying
   * which shots came back off-plan is what lets a caller re-render or re-time
   * on purpose instead of discovering it in playback.
   */
  retimedShots: RetimedShot[];
}

/** A shot whose source footage does not match its place in the cut. */
export interface TrimmedShot {
  shotId: string;
  /** Length used on the timeline. */
  usedMs: number;
  /** Length of the rendered source. */
  sourceMs: number;
}

/** A shot whose length in the cut is not the length it was directed at. */
export interface RetimedShot {
  shotId: string;
  /** Length used on the timeline. */
  usedMs: number;
  /** Length `duration_seconds` asked for, or the default. */
  directedMs: number;
}

/** A shot is assemblable when its clip landed as a persisted asset. */
export const isAssemblableShot = (shot: Shot): boolean =>
  shot.status === "rendered" &&
  !!shot.clip &&
  typeof shot.clip.asset_id === "string" &&
  shot.clip.asset_id.length > 0;

/** The persisted asset id on a media ref, or undefined when it has none. */
const assetIdOf = (ref: { asset_id?: string | null } | null | undefined) =>
  ref?.asset_id != null && ref.asset_id.length > 0
    ? ref.asset_id
    : undefined;

/** Clip length a shot was directed at: its target duration, or the default. */
export const shotDurationMs = (shot: Shot): number =>
  typeof shot.duration_seconds === "number" && shot.duration_seconds > 0
    ? Math.round(shot.duration_seconds * 1000)
    : DEFAULT_SHOT_MS;

/** Length of the footage a shot's selected clip actually holds, when known. */
export const shotSourceDurationMs = (shot: Shot): number | null => {
  const production = productionRecordOf(shot.clip);
  if (
    production !== null &&
    Number.isFinite(production.result.measuredDurationMs) &&
    production.result.measuredDurationMs > 0
  ) {
    return production.result.measuredDurationMs;
  }
  const seconds = shot.clip?.duration;
  return typeof seconds === "number" && seconds > 0
    ? Math.round(seconds * 1000)
    : null;
};

/** Intended playable window for an accepted production candidate. */
export function storyboardProductionPlayableDurationMs(
  shot: Shot
): number | null {
  const record = productionRecordOf(shot.clip);
  const requestedDurationMs = record?.candidate.snapshot.requestedDurationMs;
  return typeof requestedDurationMs === "number" && requestedDurationMs > 0
    ? requestedDurationMs
    : null;
}

function validatedStoryboardCandidate(
  shot: Shot,
  candidateId: string
): StoryboardProductionCandidateRecord | string {
  const record = storyboardCandidateForShot(shot, candidateId);
  if (record === null) {
    return `Candidate "${candidateId}" is not on shot "${shot.id}".`;
  }
  const { candidate } = record;
  const snapshot = candidate.snapshot;
  if (
    candidate.status !== "ready" ||
    candidate.assetId === undefined ||
    candidate.assetId !== assetIdOf(record.clip)
  ) {
    return `Candidate "${candidateId}" is not ready.`;
  }
  if (
    candidate.destinationKind !== "storyboard_shot" ||
    candidate.destinationId !== shot.id ||
    snapshot.candidateId !== candidate.candidateId ||
    snapshot.batchId !== candidate.batchId ||
    snapshot.requestId !== candidate.requestId ||
    snapshot.variationId !== candidate.variationId ||
    snapshot.variationIndex !== candidate.variationIndex ||
    snapshot.destinationKind !== candidate.destinationKind ||
    snapshot.destinationId !== candidate.destinationId
  ) {
    return `Candidate "${candidateId}" has invalid production provenance.`;
  }
  return record;
}

export interface StoryboardCandidatePreview {
  readonly candidateId: string;
  readonly assetId: string;
  readonly sourceTimeMs: number;
  readonly sourceDurationMs: number;
}

export type StoryboardCandidatePreviewResult =
  | { readonly ok: true; readonly preview: StoryboardCandidatePreview }
  | { readonly ok: false; readonly error: string };

/** Preview one storyboard take without selecting it on the shot. */
export function previewStoryboardProductionCandidate(
  shot: Shot,
  candidateId: string,
  relativeTimeMs: number
): StoryboardCandidatePreviewResult {
  const validated = validatedStoryboardCandidate(shot, candidateId);
  if (typeof validated === "string") {
    return { ok: false, error: validated };
  }
  const sourceDurationMs = validated.result.measuredDurationMs;
  return {
    ok: true,
    preview: {
      candidateId,
      assetId: validated.candidate.assetId ?? "",
      sourceTimeMs: Math.min(
        sourceDurationMs,
        Math.max(0, Number.isFinite(relativeTimeMs) ? relativeTimeMs : 0)
      ),
      sourceDurationMs
    }
  };
}

export interface StoryboardDraftPreview {
  readonly candidates: Readonly<Record<string, StoryboardCandidatePreview>>;
  readonly unresolvedShotIds: readonly string[];
}

/** Resolve a preview-only candidate map. Missing results remain unresolved. */
export function previewStoryboardProductionDraft(
  shots: readonly Shot[],
  audition: ProductionAuditionMap
): StoryboardDraftPreview {
  const candidates: Record<string, StoryboardCandidatePreview> = {};
  const unresolvedShotIds: string[] = [];
  for (const shotId of Object.keys(audition).sort()) {
    const shot = shots.find((item) => item.id === shotId);
    const candidateId = audition[shotId];
    if (shot === undefined || candidateId === undefined) {
      unresolvedShotIds.push(shotId);
      continue;
    }
    const preview = previewStoryboardProductionCandidate(shot, candidateId, 0);
    if (!preview.ok) {
      unresolvedShotIds.push(shotId);
      continue;
    }
    candidates[shotId] = preview.preview;
  }
  return { candidates, unresolvedShotIds };
}

export interface StoryboardTakePreconditions {
  readonly batchId?: string;
  readonly authoringFingerprint?: string;
}

export type StoryboardTakeResult =
  | {
      readonly ok: true;
      readonly shot: Shot;
      readonly candidate: ProductionCandidate;
    }
  | { readonly ok: false; readonly shot: Shot; readonly error: string };

function storyboardSourceAssetIdOf(
  snapshot: ProductionGenerationSnapshot
): string | undefined {
  const context = snapshot.sourceContext;
  if (context === undefined) return undefined;
  const camel = context["sourceAssetId"];
  if (typeof camel === "string" && camel.length > 0) return camel;
  const snake = context["source_asset_id"];
  return typeof snake === "string" && snake.length > 0 ? snake : undefined;
}

/** Validate and persist one explicit storyboard Use take choice. */
export function useStoryboardProductionTake(
  shot: Shot,
  candidateId: string,
  preconditions: StoryboardTakePreconditions = {}
): StoryboardTakeResult {
  const validated = validatedStoryboardCandidate(shot, candidateId);
  if (typeof validated === "string") {
    return { ok: false, shot, error: validated };
  }
  const { candidate, result } = validated;
  const snapshot = candidate.snapshot;
  if (
    preconditions.batchId !== undefined &&
    candidate.batchId !== preconditions.batchId
  ) {
    return {
      ok: false,
      shot,
      error: `Candidate "${candidateId}" belongs to another production batch.`
    };
  }
  if (
    preconditions.authoringFingerprint !== undefined &&
    snapshot.authoringFingerprint !== preconditions.authoringFingerprint
  ) {
    return {
      ok: false,
      shot,
      error: `Shot "${shot.id}" changed after the candidate was prepared.`
    };
  }
  const sourceAssetId = storyboardSourceAssetIdOf(snapshot);
  if (sourceAssetId !== undefined && assetIdOf(shot.clip) !== sourceAssetId) {
    return {
      ok: false,
      shot,
      error: `Candidate "${candidateId}" was generated from another source asset.`
    };
  }
  const playableDurationMs = shotDurationMs(shot);
  if (snapshot.requestedDurationMs !== playableDurationMs) {
    return {
      ok: false,
      shot,
      error: `Candidate "${candidateId}" does not match the shot's current timing.`
    };
  }
  if (result.measuredDurationMs < playableDurationMs) {
    return {
      ok: false,
      shot,
      error: `Candidate "${candidateId}" is shorter than the shot's playable window.`
    };
  }
  return {
    ok: true,
    shot: { ...shot, clip: validated.clip, status: "rendered" },
    candidate
  };
}

export interface StoryboardDraftChange {
  readonly shotId: string;
  readonly before: Shot;
  readonly after: Shot;
}

export type StoryboardDraftResult =
  | {
      readonly ok: true;
      readonly shots: readonly Shot[];
      readonly changes: readonly StoryboardDraftChange[];
    }
  | {
      readonly ok: false;
      readonly shots: readonly Shot[];
      readonly error: string;
    };

export interface StoryboardDraftPreconditions {
  readonly batchId?: string;
  readonly authoringFingerprints?: Readonly<Record<string, string>>;
}

function rejectedStoryboardDraft(
  shots: readonly Shot[],
  error: string
): StoryboardDraftResult {
  return { ok: false, shots, error };
}

/** Atomically accept an explicit ready subset of one storyboard batch. */
export function applyStoryboardProductionDraft(
  shots: readonly Shot[],
  audition: ProductionAuditionMap,
  preconditions: StoryboardDraftPreconditions = {}
): StoryboardDraftResult {
  const shotIds = Object.keys(audition).sort();
  if (shotIds.length === 0) {
    return rejectedStoryboardDraft(
      shots,
      "A storyboard production draft needs at least one candidate selection."
    );
  }

  let batchId = preconditions.batchId;
  const changes: StoryboardDraftChange[] = [];
  for (const shotId of shotIds) {
    const shot = shots.find((item) => item.id === shotId);
    if (shot === undefined) {
      return rejectedStoryboardDraft(shots, `Shot "${shotId}" no longer exists.`);
    }
    if (assetIdOf(shot.clip) !== undefined) {
      return rejectedStoryboardDraft(
        shots,
        `Shot "${shotId}" already has accepted video.`
      );
    }
    const candidateId = audition[shotId];
    if (candidateId === undefined) {
      return rejectedStoryboardDraft(shots, `No candidate was selected for shot "${shotId}".`);
    }
    const validated = validatedStoryboardCandidate(shot, candidateId);
    if (typeof validated === "string") {
      return rejectedStoryboardDraft(shots, validated);
    }
    batchId ??= validated.candidate.batchId;
    if (validated.candidate.batchId !== batchId) {
      return rejectedStoryboardDraft(
        shots,
        "A storyboard production draft may select candidates from one batch only."
      );
    }
    const applied = useStoryboardProductionTake(shot, candidateId, {
      batchId,
      authoringFingerprint: preconditions.authoringFingerprints?.[shotId]
    });
    if (!applied.ok) return rejectedStoryboardDraft(shots, applied.error);
    changes.push({ shotId, before: shot, after: applied.shot });
  }

  const changed = new Map(changes.map((change) => [change.shotId, change.after]));
  return {
    ok: true,
    shots: shots.map((shot) => changed.get(shot.id) ?? shot),
    changes
  };
}

/** Restore one atomic storyboard draft acceptance. */
export function undoStoryboardProductionDraft(
  shots: readonly Shot[],
  applied: Extract<StoryboardDraftResult, { readonly ok: true }>
): StoryboardDraftResult {
  for (const change of applied.changes) {
    const current = shots.find((shot) => shot.id === change.shotId);
    if (
      current === undefined ||
      stableSerialize(current) !== stableSerialize(change.after)
    ) {
      return rejectedStoryboardDraft(
        shots,
        `Cannot undo production draft for shot "${change.shotId}" after it changed.`
      );
    }
  }
  const before = new Map(
    applied.changes.map((change) => [change.shotId, change.before])
  );
  return {
    ok: true,
    shots: shots.map((shot) => before.get(shot.id) ?? shot),
    changes: applied.changes.map((change) => ({
      shotId: change.shotId,
      before: change.after,
      after: change.before
    }))
  };
}

/** Shots by id, for resolving {@link Shot.covered_by}. */
export const shotsById = (shots: readonly Shot[]): Map<string, Shot> =>
  new Map(shots.map((shot) => [shot.id, shot]));

/**
 * Where a shot's picture comes from: its own clip, or a window into another's.
 *
 * Assembly used to read `shot.clip` directly, so a shot covered by a fused
 * generation had no picture at all and was skipped — the run that hit this
 * trimmed the fused clips onto the track by hand and the board never caught up.
 */
export interface ShotSource {
  /** The asset the clip plays. */
  assetId: string;
  /** The shot that owns it — this shot, unless it is covered. */
  sourceShotId: string;
  /** Where this shot starts inside that asset, in ms. */
  inPointMs: number;
  /**
   * Footage available from `inPointMs` on, or null when the asset's length is
   * unknown and no coverage window pins it.
   */
  availableMs: number | null;
  /**
   * Length somebody's window fixes rather than the direction: the coverage
   * window when this shot is covered, the point another shot cuts into this
   * one's clip when it is not. Null when nothing but the shot itself decides.
   */
  windowMs: number | null;
}

export interface ShotSourceOptions {
  /**
   * Require the shot's lifecycle status to be `rendered`, as assembly does.
   * The in-editor preview passes false: it plays a selected take while the
   * board is still working, and its own tests pin that.
   */
  requireRendered?: boolean;
  /**
   * Where another shot cuts into each clip, from {@link coverageClaims}. A
   * shot that owns a fused generation plays only up to the first slice
   * somebody else took out of it.
   */
  claims?: ReadonlyMap<string, number>;
}

/** Whether a shot has a clip of its own to play, under a caller's bar. */
const playableShot = (shot: Shot, options?: ShotSourceOptions): boolean =>
  options?.requireRendered === false
    ? assetIdOf(shot.clip) !== undefined
    : isAssemblableShot(shot);

/**
 * The earliest point another shot cuts into each shot's clip.
 *
 * A fused generation lands on the first shot of the run and the rest name it
 * in `covered_by`. Its owner holds the whole asset, so a cut that laid it down
 * at its full length would play the whole run and then play the covered slices
 * again after it. The claim is where the owner's own picture ends.
 */
export function coverageClaims(
  shots: readonly Shot[],
  options?: ShotSourceOptions
): Map<string, number> {
  const claims = new Map<string, number>();
  for (const shot of shots) {
    const coveringId = shot.covered_by?.shot_id;
    // A shot with a clip of its own plays it and never reaches its coverage,
    // so it takes nothing out of the covering shot.
    if (!coveringId || coveringId === shot.id || playableShot(shot, options)) {
      continue;
    }
    const startMs = Math.max(
      0,
      Math.round((shot.covered_by?.start_seconds ?? 0) * 1000)
    );
    const claimed = claims.get(coveringId);
    if (claimed === undefined || startMs < claimed) {
      claims.set(coveringId, startMs);
    }
  }
  return claims;
}

/**
 * Resolve a shot's picture, following {@link Shot.covered_by} one hop.
 *
 * Returns null for a shot that has neither its own clip nor a covering shot
 * that has one — the same shots assembly skipped before.
 */
export function shotSource(
  shot: Shot,
  byId?: ReadonlyMap<string, Shot>,
  options?: ShotSourceOptions
): ShotSource | null {
  const playable = (candidate: Shot): boolean =>
    playableShot(candidate, options);
  if (playable(shot)) {
    const sourceMs = shotSourceDurationMs(shot);
    const productionWindowMs = storyboardProductionPlayableDurationMs(shot);
    // The head of the clip, when other shots cover the rest of it.
    const claimMs = options?.claims?.get(shot.id) ?? null;
    const windowMs =
      claimMs === null
        ? productionWindowMs
        : productionWindowMs === null
          ? claimMs
          : Math.min(claimMs, productionWindowMs);
    return {
      assetId: shot.clip!.asset_id as string,
      sourceShotId: shot.id,
      inPointMs: 0,
      availableMs:
        windowMs === null
          ? sourceMs
          : sourceMs === null
            ? windowMs
            : Math.min(sourceMs, windowMs),
      windowMs
    };
  }
  const coverage = shot.covered_by;
  if (!coverage || !byId) return null;
  const cover = byId.get(coverage.shot_id);
  // One hop: a covering shot that is itself covered has no source length to
  // measure a window against.
  if (!cover || !playable(cover)) return null;
  const inPointMs = Math.max(0, Math.round((coverage.start_seconds ?? 0) * 1000));
  const windowMs =
    typeof coverage.end_seconds === "number" && coverage.end_seconds > 0
      ? Math.max(0, Math.round(coverage.end_seconds * 1000) - inPointMs)
      : null;
  const coverSourceMs = shotSourceDurationMs(cover);
  const remainingMs =
    coverSourceMs === null ? null : Math.max(0, coverSourceMs - inPointMs);
  const availableMs =
    windowMs === null
      ? remainingMs
      : remainingMs === null
        ? windowMs
        : Math.min(windowMs, remainingMs);
  return {
    assetId: cover.clip!.asset_id as string,
    sourceShotId: cover.id,
    inPointMs,
    availableMs,
    windowMs
  };
}

/**
 * Every shot's picture in one pass: the coverage claims are computed once and
 * shared, so resolving a board is linear in the number of shots.
 */
export function shotSources(
  shots: readonly Shot[],
  options?: ShotSourceOptions
): Map<string, ShotSource | null> {
  const byId = shotsById(shots);
  const resolveOptions: ShotSourceOptions = {
    ...options,
    claims: coverageClaims(shots, options)
  };
  return new Map(
    shots.map((shot) => [shot.id, shotSource(shot, byId, resolveOptions)])
  );
}

/** Whether a shot's picture is a window into another shot's clip. */
export const isCoveredShot = (shot: Shot): boolean =>
  !isAssemblableShot(shot) && !!shot.covered_by?.shot_id;

/** How a shot's laid-down length was decided. */
export interface ShotLayout {
  /** Length on the timeline. */
  durationMs: number;
  /** Explicit source window, set whenever the source length is known. */
  inPointMs?: number;
  outPointMs?: number;
  /** Length the shot was directed at: `duration_seconds`, or the default. */
  directedMs: number;
}

/**
 * Lay a shot down at the length of the footage that came back.
 *
 * A video model returns what it returns: eight shots directed at 1.0-3.5s all
 * rendered as 5.184s. Assembly used to cut each clip down to its directed
 * length, so most of every render was discarded before anyone saw it. The
 * render is the picture, so it is the clip: a shot whose source length is
 * known plays all of it, and `duration_seconds` only decides the length of a
 * shot whose footage cannot be measured.
 *
 * A covered shot is cut out of the middle of someone else's clip, so its
 * coverage window is the footage it has — `shotSource` already folds the
 * window into `availableMs` — and that window is what it plays.
 */
export function layoutShot(shot: Shot, source?: ShotSource | null): ShotLayout {
  const resolved = source === undefined ? shotSource(shot) : source;
  const available = resolved?.availableMs ?? null;
  const inPointMs = resolved?.inPointMs ?? 0;
  const directedMs = shotDurationMs(shot);
  if (available === null) {
    // No source length to lay down. The window is still written when the shot
    // starts inside someone else's clip, or it would play that clip's head.
    const layout: ShotLayout = { durationMs: directedMs, directedMs };
    if (inPointMs > 0) {
      layout.inPointMs = inPointMs;
      layout.outPointMs = inPointMs + directedMs;
    }
    return layout;
  }
  return {
    durationMs: available,
    inPointMs,
    outPointMs: inPointMs + available,
    directedMs
  };
}

function timelineVersionFromStoryboardShot(
  shot: Shot | undefined
): TimelineClipVersion | undefined {
  const record = productionRecordOf(shot?.clip);
  if (record === null) return undefined;
  const { candidate, result } = record;
  if (candidate.status !== "ready" || candidate.assetId === undefined) {
    return undefined;
  }
  return {
    id: candidate.takeId ?? candidate.candidateId,
    createdAt: result.createdAt,
    jobId: result.jobId ?? candidate.requestId,
    assetId: candidate.assetId,
    workflowUpdatedAt: result.createdAt,
    dependencyHash: candidate.snapshot.authoringFingerprint ?? "",
    paramOverridesSnapshot: { ...(candidate.snapshot.parameters ?? {}) },
    durationMs: result.measuredDurationMs,
    status: "success",
    source: "generated",
    productionSnapshot: candidate.snapshot,
    ...(result.costCredits === undefined
      ? {}
      : { costCredits: result.costCredits }),
    ...(candidate.snapshot.provider === undefined
      ? {}
      : { provider: candidate.snapshot.provider }),
    ...(candidate.snapshot.model === undefined
      ? {}
      : { model: candidate.snapshot.model }),
    ...(candidate.snapshot.prompt === undefined
      ? {}
      : { prompt: candidate.snapshot.prompt }),
    ...(candidate.snapshot.parentTakeId === undefined
      ? {}
      : { parentTakeId: candidate.snapshot.parentTakeId })
  };
}

export function buildStoryboardTimeline(
  input: StoryboardAssemblyInput
): AssembledTimeline {
  const ordered = [...input.shots].sort((a, b) => a.index - b.index);
  const inputShotsById = shotsById(input.shots);
  const sources = shotSources(input.shots);
  const assemblable = ordered.filter((s) => sources.get(s.id) != null);
  const skippedShotIds = ordered
    .filter((s) => sources.get(s.id) == null)
    .map((s) => s.id);

  const shotTrack = makeTrack({ type: "video", name: "Shots", index: 0 });
  const shotAudioTrack = makeTrack({
    type: "audio",
    name: SHOT_AUDIO_TRACK_NAME,
    index: 1
  });
  const tracks: TimelineTrack[] = [shotTrack];
  const clips: TimelineClip[] = [];

  let cursorMs = 0;
  const retimedShots: RetimedShot[] = [];
  for (const shot of assemblable) {
    const source = sources.get(shot.id) ?? null;
    const layout = layoutShot(shot, source);
    const durationMs = layout.durationMs;
    // A shot cut to a coverage window is exactly as long as the caller asked
    // for when they split the generation; only a shot playing a clip of its
    // own can come back off the length it was directed at.
    if (source?.windowMs === null && durationMs !== layout.directedMs) {
      retimedShots.push({
        shotId: shot.id,
        usedMs: durationMs,
        directedMs: layout.directedMs
      });
    }
    const acceptedVersion = timelineVersionFromStoryboardShot(
      source === null ? undefined : inputShotsById.get(source.sourceShotId)
    );
    const videoClip = makeClip({
      trackId: shotTrack.id,
      name: shot.slug ?? `Shot ${shot.index + 1}`,
      startMs: cursorMs,
      durationMs,
      mediaType: "video",
      sourceType: "imported",
      status: "generated",
      currentAssetId: source?.assetId,
      linkId: createTimeOrderedUuid(),
      storyboardBoardId: input.boardId,
      storyboardShotId: shot.id,
      versions: acceptedVersion === undefined ? [] : [acceptedVersion],
      ...(acceptedVersion === undefined
        ? {}
        : { activeTakeId: acceptedVersion.id })
    });
    // The window is written only when the source length is known: an unknown
    // length leaves the clip exactly as it was before assembly could read one.
    if (layout.inPointMs !== undefined) {
      videoClip.inPointMs = layout.inPointMs;
      videoClip.outPointMs = layout.outPointMs;
    }
    clips.push(videoClip, shotAudioClip(videoClip, shotAudioTrack.id));
    cursorMs += durationMs;
  }
  if (cursorMs > 0) {
    tracks.push(shotAudioTrack);
  }

  const narration = input.narration?.trim();
  if (narration && cursorMs > 0) {
    const track = makeTrack({
      type: "audio",
      name: "Narration",
      index: tracks.length
    });
    tracks.push(track);
    clips.push(
      makeClip({
        trackId: track.id,
        name: "Narration",
        startMs: 0,
        durationMs: cursorMs,
        mediaType: "audio",
        sourceType: "generated",
        bindingKind: "text-to-audio",
        prompt: narration,
        status: "draft",
        versions: []
      })
    );
  }

  const musicPrompt = input.musicPrompt?.trim();
  if (musicPrompt && cursorMs > 0) {
    const track = makeTrack({
      type: "audio",
      name: "Music",
      index: tracks.length
    });
    tracks.push(track);
    clips.push(
      makeClip({
        trackId: track.id,
        name: "Music",
        startMs: 0,
        durationMs: cursorMs,
        mediaType: "audio",
        sourceType: "generated",
        bindingKind: "text-to-audio",
        prompt: musicPrompt,
        status: "draft",
        versions: []
      })
    );
  }

  return {
    tracks,
    clips,
    durationMs: cursorMs,
    skippedShotIds,
    // Nothing is trimmed: every shot is laid down at the length of the
    // footage it holds, so no clip leaves any of its render unplayed.
    trimmedShots: [],
    retimedShots
  };
}

export interface StoryboardPreviewInput {
  /** Board id stamped onto each clip. */
  boardId: string;
  shots: Shot[];
}

export interface StoryboardPreviewTimeline {
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  /** Total duration of the shot track in ms. */
  durationMs: number;
  /** Shots skipped because neither clip nor keyframe has a persisted asset. */
  skippedShotIds: string[];
  /** Shots shown as held keyframe stills because no clip asset exists. */
  stillShotIds: string[];
}

/**
 * Assemble a board into the cut an in-editor player scrubs.
 *
 * Unlike {@link buildStoryboardTimeline}, which only lays down finished shots,
 * this fills the gaps: a shot with a selected clip asset plays that clip, a
 * shot that so far has only a keyframe holds that still for the shot's length,
 * and a shot with neither is dropped. A selected take plays whatever the shot's
 * lifecycle status says, so a preview keeps working while the board is still
 * rendering. Each played clip gets its audio twin, so a preview sounds like the
 * assembled cut. Narration and music are left out — they are draft prompts with
 * no audio behind them yet.
 */
export function buildStoryboardPreviewTimeline(
  input: StoryboardPreviewInput
): StoryboardPreviewTimeline {
  const ordered = [...input.shots].sort((a, b) => a.index - b.index);
  const inputShotsById = shotsById(input.shots);

  const shotTrack = makeTrack({ type: "video", name: "Shots", index: 0 });
  const shotAudioTrack = makeTrack({
    type: "audio",
    name: SHOT_AUDIO_TRACK_NAME,
    index: 1
  });
  const tracks: TimelineTrack[] = [shotTrack];
  const clips: TimelineClip[] = [];
  const skippedShotIds: string[] = [];
  const stillShotIds: string[] = [];
  let hasShotAudio = false;

  const sources = shotSources(input.shots, { requireRendered: false });
  let cursorMs = 0;
  for (const shot of ordered) {
    const source = sources.get(shot.id) ?? null;
    const clipAssetId = source?.assetId;
    const stillAssetId = clipAssetId ? undefined : assetIdOf(shot.keyframe);
    const assetId = clipAssetId ?? stillAssetId;
    if (!assetId) {
      skippedShotIds.push(shot.id);
      continue;
    }
    if (stillAssetId) {
      stillShotIds.push(shot.id);
    }

    // A held keyframe is a still with no source length of its own; only a
    // real clip gets fitted to its footage.
    const directedMs = shotDurationMs(shot);
    const layout: ShotLayout = clipAssetId
      ? layoutShot(shot, source)
      : { durationMs: directedMs, directedMs };
    const durationMs = layout.durationMs;
    const acceptedVersion = clipAssetId
      ? timelineVersionFromStoryboardShot(
          source === null ? undefined : inputShotsById.get(source.sourceShotId)
        )
      : undefined;
    const shotClip = makeClip({
      trackId: shotTrack.id,
      name: shot.slug ?? `Shot ${shot.index + 1}`,
      startMs: cursorMs,
      durationMs,
      mediaType: clipAssetId ? "video" : "image",
      sourceType: "imported",
      status: "generated",
      currentAssetId: assetId,
      linkId: clipAssetId ? createTimeOrderedUuid() : undefined,
      storyboardBoardId: input.boardId,
      storyboardShotId: shot.id,
      versions: acceptedVersion === undefined ? [] : [acceptedVersion],
      ...(acceptedVersion === undefined
        ? {}
        : { activeTakeId: acceptedVersion.id })
    });
    if (layout.inPointMs !== undefined) {
      shotClip.inPointMs = layout.inPointMs;
      shotClip.outPointMs = layout.outPointMs;
    }
    clips.push(shotClip);
    // A held keyframe is a still: there is no rendered clip to take sound from.
    if (clipAssetId) {
      clips.push(shotAudioClip(shotClip, shotAudioTrack.id));
      hasShotAudio = true;
    }
    cursorMs += durationMs;
  }
  if (hasShotAudio) {
    tracks.push(shotAudioTrack);
  }

  return {
    tracks,
    clips,
    durationMs: cursorMs,
    skippedShotIds,
    stillShotIds
  };
}
