/**
 * Game-asset audio slots: fit a clip to the length a template asked for and
 * stamp it with the {@link SlotFill} the Godot writer reads.
 *
 * Both nodes operate in sample space (decode → edit → re-encode), per this
 * package's rules. The fill is validated with the protocol Zod schema before it
 * is returned, so a bad slot id fails here, not in the writer.
 */
import type { AudioRef, MusicFill, SfxFill } from "@nodetool-ai/protocol";
import { SLOT_METADATA_KEY, musicFill, sfxFill } from "@nodetool-ai/protocol";
import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { isString } from "../type-predicates.js";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { tagAsServer } from "@nodetool-ai/nodes-utils";
import {
  requireAudioBytes,
  audioRefFromWav,
  decodeAudioToWav,
  encodeWav,
  type WavData
} from "../lib/audio-wav.js";

const AUDIO_PROP_DEFAULT = {
  type: "audio",
  uri: "",
  asset_id: null,
  data: null,
  metadata: null
};

/** Fade-out length that hides the cut without being audible as a fade. */
const SFX_FADE_OUT_MS = 10;

function frameCount(wav: WavData): number {
  return Math.floor(wav.samples.length / wav.numChannels);
}

/** First `frames` frames of an interleaved clip. */
export function trimToFrames(wav: WavData, frames: number): WavData {
  const keep = Math.min(frames, frameCount(wav));
  return {
    samples: wav.samples.slice(0, keep * wav.numChannels),
    sampleRate: wav.sampleRate,
    numChannels: wav.numChannels
  };
}

/** Linear fade to silence over the last `ms` milliseconds, in place. */
export function fadeOutTail(wav: WavData, ms: number): WavData {
  const frames = frameCount(wav);
  const fade = Math.min(frames, Math.round((ms / 1000) * wav.sampleRate));
  if (fade <= 0) return wav;
  const start = frames - fade;
  for (let i = 0; i < fade; i++) {
    const gain = 1 - (i + 1) / fade;
    for (let ch = 0; ch < wav.numChannels; ch++) {
      wav.samples[(start + i) * wav.numChannels + ch] *= gain;
    }
  }
  return wav;
}

/**
 * Loop crossfade: the last `ms` of the clip are faded out while the first
 * `ms` are faded in on top of them, and the head is dropped. The result is
 * `ms` shorter, and its end flows into its start with no discontinuity.
 */
export function loopCrossfade(wav: WavData, ms: number): WavData {
  const frames = frameCount(wav);
  const n = Math.min(Math.round((ms / 1000) * wav.sampleRate), Math.floor(frames / 2));
  if (n <= 0) return wav;
  const { numChannels } = wav;
  const outFrames = frames - n;
  const out = new Float32Array(outFrames * numChannels);
  // Body: frames [n, frames - n) copied as-is.
  out.set(wav.samples.subarray(n * numChannels, (frames - n) * numChannels));
  // Seam: tail fades out, head fades in, equal-power so the sum stays level.
  const tailStart = frames - n;
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / (n + 1);
    const gainTail = Math.cos((t * Math.PI) / 2);
    const gainHead = Math.sin((t * Math.PI) / 2);
    for (let ch = 0; ch < numChannels; ch++) {
      out[(outFrames - n + i) * numChannels + ch] =
        wav.samples[(tailStart + i) * numChannels + ch] * gainTail +
        wav.samples[i * numChannels + ch] * gainHead;
    }
  }
  return { samples: out, sampleRate: wav.sampleRate, numChannels };
}

function withSlotMetadata(ref: AudioRef, fill: SfxFill | MusicFill, seconds: number): AudioRef {
  return {
    ...ref,
    duration: seconds,
    metadata: { ...(ref.metadata ?? {}), [SLOT_METADATA_KEY]: fill }
  };
}

/**
 * Store the trimmed clip as its own asset when the context can. The bytes
 * differ from the input's (trimmed, faded, crossfaded), so the stored asset
 * is the only durable copy `export_godot_project` can read, and the fill
 * rides on its metadata.
 */
async function persistStamped(
  context: ProcessingContext | undefined,
  nodeName: string,
  slotId: string,
  ref: AudioRef,
  wavBytes: Uint8Array
): Promise<AudioRef> {
  if (!context?.hasModelInterface?.("createAsset")) return ref;
  const created = (await context.createAsset({
    name: `${slotId.replace(/\./g, "_")}.wav`,
    contentType: "audio/wav",
    content: wavBytes,
    metadata: ref.metadata as Record<string, unknown>
  })) as Record<string, unknown> | null;
  const id = created ? created["id"] : null;
  if (!isString(id) || id === "") throw new Error(`${nodeName}: the asset was created without an id.`);
  return { ...ref, uri: `asset://${id}.wav`, asset_id: id };
}

// ── SoundEffect ───────────────────────────────────────────────────

type SoundEffectNodeOutputs = {
  output: AudioRef;
  fill: SfxFill;
};

export class SoundEffectNode extends BaseNode {
  static readonly nodeType = "nodetool.game.SoundEffect";
  static readonly title = "Game Sound Effect";
  static readonly description =
    "Fits a clip to a game template's sound-effect slot: trims it to the target length with a short fade-out and stamps it with the slot fill.\n    audio, game, godot, sfx";
  static readonly metadataOutputTypes = {
    output: "audio",
    fill: "dict"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["audio"];

  @prop({
    type: "audio",
    default: AUDIO_PROP_DEFAULT,
    title: "Audio",
    description: "The generated sound effect."
  })
  declare audio: any;

  @prop({
    type: "str",
    default: "",
    title: "Slot ID",
    description: "The manifest slot this clip fills, e.g. sfx.jump."
  })
  declare slot_id: any;

  @prop({
    type: "float",
    default: 0.5,
    title: "Seconds",
    description: "Target length from the manifest slot.",
    min: 0.01
  })
  declare seconds: any;

  @prop({
    type: "bool",
    default: true,
    title: "Trim",
    description: "Cut the clip to the target length with a 10 ms fade-out."
  })
  declare trim: any;

  async process(context?: ProcessingContext): Promise<SoundEffectNodeOutputs> {
    const target = Number(this.seconds);
    const bytes = await requireAudioBytes(this.audio ?? {}, context);
    let wav = await decodeAudioToWav(bytes);
    if (this.trim !== false) {
      const targetFrames = Math.round(target * wav.sampleRate);
      if (frameCount(wav) > targetFrames) {
        wav = fadeOutTail(trimToFrames(wav, targetFrames), SFX_FADE_OUT_MS);
      }
    }
    const seconds = frameCount(wav) / wav.sampleRate;
    const fill = sfxFill.parse({
      kind: "sfx",
      slot_id: String(this.slot_id ?? ""),
      seconds
    });
    const wavBytes = encodeWav(wav.samples, wav.sampleRate, wav.numChannels);
    const ref = audioRefFromWav(wavBytes);
    return {
      output: await persistStamped(context, SoundEffectNode.title, fill.slot_id, withSlotMetadata(ref, fill, seconds), wavBytes),
      fill
    };
  }
}

// ── MusicLoop ─────────────────────────────────────────────────────

type MusicLoopNodeOutputs = {
  output: AudioRef;
  fill: MusicFill;
};

export class MusicLoopNode extends BaseNode {
  static readonly nodeType = "nodetool.game.MusicLoop";
  static readonly title = "Game Music Loop";
  static readonly description =
    "Fits a track to a game template's music slot: trims it to the target length and crossfades the end into the start so it loops without a click.\n    audio, game, godot, music, loop";
  static readonly metadataOutputTypes = {
    output: "audio",
    fill: "dict"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["audio"];

  @prop({
    type: "audio",
    default: AUDIO_PROP_DEFAULT,
    title: "Audio",
    description: "The generated music track."
  })
  declare audio: any;

  @prop({
    type: "str",
    default: "",
    title: "Slot ID",
    description: "The manifest slot this track fills, e.g. music.level."
  })
  declare slot_id: any;

  @prop({
    type: "float",
    default: 60,
    title: "Seconds",
    description: "Target length from the manifest slot.",
    min: 0.1
  })
  declare seconds: any;

  @prop({
    type: "int",
    default: 250,
    title: "Crossfade (ms)",
    description: "How much of the tail is blended into the head to close the loop.",
    min: 0,
    max: 5000
  })
  declare crossfade_ms: any;

  @prop({
    type: "bool",
    default: true,
    title: "Trim",
    description: "Cut the track to the target length before closing the loop."
  })
  declare trim: any;

  async process(context?: ProcessingContext): Promise<MusicLoopNodeOutputs> {
    const target = Number(this.seconds);
    const crossfadeMs = Math.max(0, Number(this.crossfade_ms ?? 250));
    const bytes = await requireAudioBytes(this.audio ?? {}, context);
    let wav = await decodeAudioToWav(bytes);
    if (this.trim !== false) {
      // Trim to target plus the crossfade so the loop lands on the target.
      const targetFrames = Math.round((target + crossfadeMs / 1000) * wav.sampleRate);
      if (frameCount(wav) > targetFrames) {
        wav = trimToFrames(wav, targetFrames);
      }
    }
    wav = loopCrossfade(wav, crossfadeMs);
    const seconds = frameCount(wav) / wav.sampleRate;
    const fill = musicFill.parse({
      kind: "music",
      slot_id: String(this.slot_id ?? ""),
      seconds,
      loop: true
    });
    const wavBytes = encodeWav(wav.samples, wav.sampleRate, wav.numChannels);
    const ref = audioRefFromWav(wavBytes);
    return {
      output: await persistStamped(context, MusicLoopNode.title, fill.slot_id, withSlotMetadata(ref, fill, seconds), wavBytes),
      fill
    };
  }
}

export const GAME_NODES = tagAsServer([SoundEffectNode, MusicLoopNode]);
