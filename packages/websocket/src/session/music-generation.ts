/**
 * The music mode path of `generate_media` (MUSIC-MODE.md sections 10 and 11,
 * MD17).
 *
 * A `mode: "music"` request that carries a `music` object runs here; without
 * the object the plain text-to-music path in `inference.ts` runs unchanged.
 * The request keeps the RPC's request id, cancel command, generation row and
 * `lookup_generations` recovery: the provider call runs inside the same
 * generation seam, and the takes and timing are written into the row's
 * parameters, the way `media_edit_references` is.
 *
 * Each candidate is decoded to 48 kHz stereo float. A 32-bit float WAV at
 * that rate, which ace-server returns, is read bit for bit and never
 * resampled (AL-1). Then, per task:
 *
 * - text2music: one -3 dBFS gain per candidate, the grid offset (applied when
 *   `align` is set and the measurement is confident), and a cut per segment.
 * - repaint: the region of each candidate spliced into a copy of the parent.
 * - lego: the region of each candidate, at the backend's level.
 *
 * Every take is stored as a 48 kHz stereo 32-bit float WAV. A segment or
 * region that ends past a candidate's audio fails the request instead of
 * being padded with silence: ace-server sizes its output from whole seconds
 * or whole latent steps, so a short candidate is a backend result, not a
 * silent tail. A request that fails or is cancelled deletes the takes it had
 * already stored.
 */

import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createLogger } from "@nodetool-ai/config";
import { linkGenerationAssets } from "@nodetool-ai/execution";
import { Asset, Prediction } from "@nodetool-ai/models";
import type { MusicGenerationRecord } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import {
  MUSIC_SAMPLE_RATE,
  type MusicGenerationRequest,
  type MusicGenerationTiming,
  type MusicTakeResult
} from "@nodetool-ai/protocol";
import { loadMediaModule } from "@nodetool-ai/runtime";
import type {
  BaseProvider,
  MusicTaskParams,
  MusicTaskResult
} from "@nodetool-ai/runtime";
import {
  MUSIC_CHANNELS,
  alignmentForTake,
  applyGain,
  cutRange,
  measureAlignmentAsync,
  pcmFrames,
  peakNormalizeGain,
  spliceRegion,
  type MusicAlignment
} from "@nodetool-ai/timeline/music/process";

import { retrieveAssetBytes } from "../lib/asset-paths.js";
import { encodeFloatWav, readFloatWav, readWavInfo } from "../lib/float-wav.js";
import { getAssetAdapter } from "../lib/storage.js";
import type { GenerationRun } from "./media-generation.js";

const log = createLogger("nodetool.websocket.music-generation");

/** What the music path answers the RPC with (MUSIC-MODE.md section 10). */
export interface MusicGenerationResult {
  /** Candidate by candidate, segment by segment. */
  asset_ids: string[];
  music_takes: MusicTakeResult[];
  timing: MusicGenerationTiming;
}

/**
 * Where the backend is with a job, stored in the row's parameters while the
 * row is `running`: `queued` behind an earlier job, or `running` on this one.
 */
export type MusicJobStatus = "queued" | "running";

export interface MusicGenerationRequestContext {
  userId: string;
  provider: BaseProvider;
  providerId: string;
  /** The DiT model id. */
  model: string;
  /** The caption, after entity expansion. */
  prompt: string;
  music: MusicGenerationRequest;
  run: Pick<GenerationRun, "generate" | "storeAsset" | "discardAsset">;
}

/** 48 kHz stereo float PCM decoded from an asset or a candidate. */
interface DecodedPcm {
  samples: Float32Array;
  /** Whether the source was at another rate or channel count. */
  resampled: boolean;
}

/**
 * Decode `bytes` to interleaved 48 kHz stereo float. A float WAV already in
 * that format is read without conversion; anything else goes through libav
 * once, resampled only when its rate or layout differs.
 */
export async function decodeMusicPcm(
  bytes: Uint8Array,
  signal?: AbortSignal
): Promise<DecodedPcm> {
  const direct = readFloatWav(bytes, MUSIC_SAMPLE_RATE, MUSIC_CHANNELS);
  if (direct) return { samples: direct, resampled: false };
  const media = await loadMediaModule();
  const wav = readWavInfo(bytes);
  const source = wav ?? (await media.probeMedia(bytes, { signal })).audio;
  if (!source) throw new Error("Music audio has no audio stream");
  const dir = await mkdtemp(join(tmpdir(), "nodetool-music-"));
  try {
    const file = join(dir, "audio");
    await writeFile(file, bytes);
    const pcm = await media.decodeAudioToPcm(file, {
      sampleRate: MUSIC_SAMPLE_RATE,
      channels: MUSIC_CHANNELS,
      signal
    });
    return {
      samples: pcm.samples,
      resampled:
        source.sampleRate !== MUSIC_SAMPLE_RATE ||
        source.channels !== MUSIC_CHANNELS
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** One owned asset's full id and bytes. */
async function loadOwnedAsset(
  userId: string,
  assetId: string,
  role: string
): Promise<{ id: string; bytes: Uint8Array }> {
  const asset = await Asset.find(userId, assetId);
  if (!asset) throw new Error(`Music ${role} asset not found: ${assetId}`);
  const bytes = await retrieveAssetBytes(
    getAssetAdapter(),
    userId,
    asset.id,
    asset.content_type
  );
  if (!bytes) throw new Error(`Music ${role} asset bytes not found: ${assetId}`);
  return { id: asset.id, bytes };
}

/** Refuse a provider that does not advertise `music_task`. */
function requireMusicTask(provider: BaseProvider, providerId: string): void {
  const capabilities =
    typeof provider.getCapabilities === "function"
      ? provider.getCapabilities()
      : [];
  if (!capabilities.includes("music_task")) {
    throw new Error(
      `Provider ${providerId} does not support the music_task capability`
    );
  }
}

function frameSeconds(frames: number): number {
  return frames / MUSIC_SAMPLE_RATE;
}

/** The backend job the request names (MUSIC-MODE.md section 12.1). */
function musicTaskParams(
  context: MusicGenerationRequestContext,
  sourceAudio: Uint8Array | undefined,
  signal: AbortSignal,
  onRunning: () => void
): MusicTaskParams {
  const { music } = context;
  const params: MusicTaskParams = {
    task: music.task,
    model: context.model,
    caption: context.prompt,
    bpm: music.bpm,
    timeSignature: music.beats_per_bar,
    durationSec: frameSeconds(music.request_frames),
    candidates: music.candidates,
    signal,
    onRunning
  };
  if (music.lm_model) params.lmModel = music.lm_model;
  if (music.key) params.key = `${music.key.tonic} ${music.key.mode}`;
  if (music.seed !== undefined) params.seed = music.seed;
  if (music.steps !== undefined) params.steps = music.steps;
  if (music.audio_codes) params.audioCodes = music.audio_codes;
  if (music.track_role) params.trackRole = music.track_role;
  if (sourceAudio) params.sourceAudio = sourceAudio;
  if (music.region) {
    params.regionStartSec = frameSeconds(music.region.start_frame);
    params.regionEndSec = frameSeconds(music.region.end_frame);
  }
  return params;
}

/** The record fields every take of this request shares. */
function baseRecord(
  context: MusicGenerationRequestContext,
  result: MusicTaskResult,
  contextAssetId: string | undefined
): Omit<
  MusicGenerationRecord,
  "seed" | "candidateIndex" | "segmentIndex" | "targetStartFrame" | "targetEndFrame"
> {
  const { music } = context;
  const windowStart = music.window_start_frame ?? 0;
  const record: Omit<
    MusicGenerationRecord,
    "seed" | "candidateIndex" | "segmentIndex" | "targetStartFrame" | "targetEndFrame"
  > = {
    task: music.task,
    backend: result.backend,
    steps: music.steps ?? 0,
    bpm: music.bpm,
    beatsPerBar: music.beats_per_bar,
    beatUnit: music.beat_unit,
    requestFrames: music.request_frames
  };
  if (music.lm_model) record.lmModel = music.lm_model;
  if (music.key) record.key = music.key;
  if (music.track_role) record.trackRole = music.track_role;
  if (contextAssetId) {
    record.contextAssetId = contextAssetId;
    record.contextStartFrame = windowStart;
    record.contextEndFrame = windowStart + music.request_frames;
  }
  return record;
}

function alignmentRecord(
  alignment: MusicAlignment,
  corrected: boolean
): NonNullable<MusicGenerationRecord["alignment"]> {
  return {
    offsetFrames: alignment.offsetFrames,
    corrected,
    confidence: alignment.confidence,
    tempoRatio: alignment.tempoRatio,
    lastBeatErrorMs: alignment.lastBeatErrorMs,
    drifting: alignment.drifting
  };
}

/** A decoded candidate and the PCM of each take built from it. */
interface CandidateTakes {
  takes: Array<{
    samples: Float32Array;
    segment: number;
    record: Partial<MusicGenerationRecord>;
  }>;
}

/**
 * Let the server answer other requests between slices of the alignment
 * measurement, which takes about 1 s per minute of audio (backlog M3).
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

interface SpliceParent {
  id: string;
  pcm: DecodedPcm;
}

/**
 * Refuse a cut that would end past the candidate's audio. The backend
 * returned less than the request needs, and a padded take would end in
 * silence the user did not ask for.
 */
function requireFrames(
  samples: Float32Array,
  endFrame: number,
  candidate: number,
  what: string
): void {
  const frames = pcmFrames(samples);
  if (endFrame > frames) {
    throw new Error(
      `Music candidate ${candidate}: ${what} ends at frame ${endFrame}, past the end of the generated audio ` +
        `(${frames} frames). The backend returned less audio than the request needs.`
    );
  }
}

/**
 * text2music: gain, measure and cut every segment of one candidate. Each
 * take's target is the clip range: segment `index` of a Generate is an
 * alternative for the clip at the first segment's place (MUSIC-MODE.md
 * section 10), so it moves back by `index` segment lengths.
 */
async function generateTakes(
  music: MusicGenerationRequest,
  samples: Float32Array,
  candidate: number
): Promise<CandidateTakes> {
  const segments = music.segments ?? [];
  const { gain, gainDb } = peakNormalizeGain(samples);
  const scaled = applyGain(samples, gain);
  const firstSegment = segments[0];
  const measured = await measureAlignmentAsync(
    scaled,
    {
      bpm: music.bpm,
      beatUnit: music.beat_unit,
      beatPhaseFrames: music.beat_phase_frames ?? 0,
      takeFrames: firstSegment ? firstSegment.end_frame - firstSegment.start_frame : 0
    },
    yieldToEventLoop
  );
  const corrected = music.align === true && measured.confident;
  const offset = corrected ? measured.offsetFrames : 0;
  const windowStart = music.window_start_frame ?? 0;
  return {
    takes: segments.map((range, position) => {
      const segment = range.index ?? position;
      const takeFrames = range.end_frame - range.start_frame;
      // A negative offset pads the head with silence by design; a positive
      // one moves the cut later, toward the end of the audio.
      requireFrames(samples, range.end_frame + Math.max(0, offset), candidate, `segment ${segment}`);
      const targetStartFrame = windowStart + range.start_frame - segment * takeFrames;
      return {
        samples: cutRange(scaled, range, offset),
        segment,
        record: {
          targetStartFrame,
          targetEndFrame: targetStartFrame + takeFrames,
          alignment: alignmentRecord(alignmentForTake(measured, takeFrames), corrected),
          gainDb
        }
      };
    })
  };
}

/** The region of a repaint or lego candidate, and its tempo measurement. */
async function regionOf(
  music: MusicGenerationRequest,
  samples: Float32Array,
  candidate: number
): Promise<{ region: Float32Array; alignment: MusicAlignment }> {
  const range = music.region;
  if (!range) throw new Error(`${music.task} needs a region`);
  requireFrames(samples, range.end_frame, candidate, "the region");
  const region = cutRange(samples, range);
  const alignment = await measureAlignmentAsync(
    region,
    {
      bpm: music.bpm,
      beatUnit: music.beat_unit,
      // The phase is window-relative; the region starts later in the window.
      beatPhaseFrames: (music.beat_phase_frames ?? 0) - range.start_frame,
      takeFrames: range.end_frame - range.start_frame
    },
    yieldToEventLoop
  );
  return { region, alignment };
}

/** repaint: splice the region into a copy of the parent. */
async function repaintTakes(
  music: MusicGenerationRequest,
  samples: Float32Array,
  parent: SpliceParent,
  candidate: number
): Promise<CandidateTakes> {
  const splice = music.splice;
  const range = music.region;
  if (!splice || !range) throw new Error("repaint needs a region and a splice parent");
  const { region, alignment } = await regionOf(music, samples, candidate);
  const spliced = spliceRegion(
    parent.pcm.samples,
    region,
    splice.start_frame,
    splice.end_frame
  );
  const windowStart = music.window_start_frame ?? 0;
  const spliceRecord: NonNullable<MusicGenerationRecord["splice"]> = {
    parentAssetId: parent.id,
    startFrame: splice.start_frame,
    endFrame: splice.end_frame,
    crossfadeFrames: spliced.crossfadeFrames
  };
  if (parent.pcm.resampled) spliceRecord.parentResampled = true;
  return {
    takes: [
      {
        samples: spliced.samples,
        segment: 0,
        record: {
          targetStartFrame: windowStart + range.start_frame,
          targetEndFrame: windowStart + range.end_frame,
          splice: spliceRecord,
          alignment: alignmentRecord(alignment, false)
        }
      }
    ]
  };
}

/** lego: the region at the backend's level. */
async function legoTakes(
  music: MusicGenerationRequest,
  samples: Float32Array,
  candidate: number
): Promise<CandidateTakes> {
  const range = music.region;
  if (!range) throw new Error("lego needs a region");
  const { region, alignment } = await regionOf(music, samples, candidate);
  const windowStart = music.window_start_frame ?? 0;
  return {
    takes: [
      {
        samples: region,
        segment: 0,
        record: {
          targetStartFrame: windowStart + range.start_frame,
          targetEndFrame: windowStart + range.end_frame,
          alignment: alignmentRecord(alignment, false)
        }
      }
    ]
  };
}

/**
 * Merge `patch` into the generation row's parameters. Writes are chained so
 * a late status write cannot land after a later one.
 */
function rowParameterWriter(
  userId: string,
  generationId: string
): { patch(fields: Record<string, unknown>): Promise<void>; settled(): Promise<void> } {
  let chain: Promise<void> = Promise.resolve();
  const write = async (fields: Record<string, unknown>): Promise<void> => {
    const row = await Prediction.findForUser(userId, generationId);
    if (!row) return;
    await row.update({ parameters: { ...(row.parameters ?? {}), ...fields } });
  };
  return {
    patch(fields) {
      chain = chain.then(() =>
        write(fields).catch((error: unknown) => {
          log.warn("Music generation row not updated", {
            generation_id: generationId,
            error: error instanceof Error ? error.message : String(error)
          });
        })
      );
      return chain;
    },
    settled() {
      return chain;
    }
  };
}

/** Delete stored takes, logging the ones that could not be deleted. */
async function discardAssets(
  run: Pick<GenerationRun, "discardAsset">,
  assetIds: string[]
): Promise<void> {
  for (const assetId of assetIds) {
    await run.discardAsset(assetId).catch((error: unknown) => {
      log.warn("Music take not deleted after a failed request", {
        asset_id: assetId,
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }
}

/** Run one music mode request end to end. */
export async function runMusicGeneration(
  context: MusicGenerationRequestContext
): Promise<MusicGenerationResult> {
  const { userId, provider, providerId, music, run } = context;
  requireMusicTask(provider, providerId);

  // Load and decode the inputs first, so a missing or unreadable asset fails
  // before the backend spends minutes on the job.
  const contextAsset = music.context_asset_id
    ? await loadOwnedAsset(userId, music.context_asset_id, "context")
    : undefined;
  let parent: SpliceParent | undefined;
  if (music.task === "repaint") {
    if (!music.splice) throw new Error("repaint needs a splice parent");
    const loaded = await loadOwnedAsset(userId, music.splice.parent_asset_id, "splice parent");
    const pcm = await decodeMusicPcm(loaded.bytes);
    const frames = pcmFrames(pcm.samples);
    if (music.splice.end_frame > frames) {
      throw new Error(
        `Splice span ends at frame ${music.splice.end_frame}, past the parent's ${frames} frames`
      );
    }
    parent = { id: loaded.id, pcm };
  }

  const generationId = randomUUID();
  const status: { value: MusicJobStatus } = { value: "queued" };
  const rowParams = {
    prompt: context.prompt,
    duration_seconds: frameSeconds(music.request_frames),
    music,
    music_status: status.value
  };
  const row = rowParameterWriter(userId, generationId);

  const generated = await run.generate(
    // The row and its pricing keep the capability the music path always had.
    "text_to_music",
    rowParams,
    null,
    async (abort) => {
      let result: MusicTaskResult;
      try {
          result = await provider.musicTask(
            musicTaskParams(context, contextAsset?.bytes, abort, () => {
              if (status.value === "running" || abort.aborted) return;
              status.value = "running";
              void row.patch({ music_status: "running" });
            })
          );
        } finally {
          await row.settled();
        }
        if (result.candidates.length === 0) {
          throw new Error("Music backend returned no candidates");
        }
        const assetIds: string[] = [];
        const takes: MusicTakeResult[] = [];
        const shared = baseRecord(context, result, contextAsset?.id);
        try {
        for (const [candidate, output] of result.candidates.entries()) {
          abort.throwIfAborted();
          const { samples } = await decodeMusicPcm(output.audio, abort);
          let built: CandidateTakes;
          if (music.task === "text2music") {
            built = await generateTakes(music, samples, candidate);
          } else if (music.task === "repaint") {
            if (!parent) throw new Error("repaint needs a splice parent");
            built = await repaintTakes(music, samples, parent, candidate);
          } else {
            built = await legoTakes(music, samples, candidate);
          }
          for (const take of built.takes) {
            abort.throwIfAborted();
            const assetId = await run.storeAsset(
              encodeFloatWav(take.samples, MUSIC_SAMPLE_RATE, MUSIC_CHANNELS),
              "audio/wav",
              "wav"
            );
            const record: MusicGenerationRecord = {
              ...shared,
              seed: output.seed,
              candidateIndex: candidate,
              segmentIndex: take.segment,
              targetStartFrame: take.record.targetStartFrame ?? 0,
              targetEndFrame: take.record.targetEndFrame ?? 0
            };
            if (output.audioCodes) record.audioCodes = output.audioCodes;
            if (take.record.alignment) record.alignment = take.record.alignment;
            if (take.record.splice) record.splice = take.record.splice;
            if (take.record.gainDb !== undefined) record.gainDb = take.record.gainDb;
            assetIds.push(assetId);
            takes.push({
              asset_id: assetId,
              candidate,
              segment: take.segment,
              record
            });
          }
        }
      } catch (error) {
        // The request fails or is cancelled: no take of it is kept.
        await discardAssets(run, assetIds);
        throw error;
      }
      const timing: MusicGenerationTiming = {
        queue_ms: result.timing.queueMs,
        lm_ms: result.timing.lmMs,
        synth_ms: result.timing.synthMs
      };
      // Before the seam closes the row, so a client that reconnects reads the
      // takes from `lookup_generations` as soon as the row is completed.
      await row.patch({ music_takes: takes, timing });
      return { asset_ids: assetIds, music_takes: takes, timing };
    },
    generationId
  );
  await linkGenerationAssets([generated.id], generated.output.asset_ids);
  return generated.output;
}
