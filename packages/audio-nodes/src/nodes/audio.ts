import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type {
  InputMode,
  OutputCorrelation,
  Platform
} from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { tagAsServer } from "@nodetool-ai/nodes-utils";
import {
  loadNodeFsPromises,
  loadNodePath
} from "@nodetool-ai/nodes-utils";

const NODE_ONLY: readonly Platform[] = ["node"];
import {
  audioBytes,
  audioBytesAsync,
  audioRefFromBytes,
  audioRefFromWav,
  concatBytes,
  encodePcm16Wav,
  encodeWav,
  parseWavBytes,
  readWavHeader,
  toBytes,
  tryDecodeWav,
  uriToPath,
  type WavData
} from "../lib/audio-wav.js";

const DEFAULT_AUDIO_EXTENSIONS = [
  ".mp3",
  ".wav",
  ".flac",
  ".ogg",
  ".m4a",
  ".aac"
];

/** Number of sample frames (samples per channel) in a decoded WAV. */
function wavFrameCount(wav: WavData): number {
  return wav.numChannels > 0
    ? Math.floor(wav.samples.length / wav.numChannels)
    : 0;
}

/**
 * Recursively (optionally) walk a folder yielding audio files whose extension
 * is in `extensions` (compared case-insensitively, leading dot required).
 */
async function* walkAudioFiles(
  folder: string,
  extensions: string[],
  recursive: boolean
): AsyncGenerator<{ full: string; name: string }> {
  const fs = await loadNodeFsPromises();
  const path = await loadNodePath();
  let entries;
  try {
    entries = await fs.readdir(folder, { withFileTypes: true });
  } catch {
    // folder does not exist or is not accessible
    return;
  }
  for (const entry of entries) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      if (recursive) yield* walkAudioFiles(full, extensions, recursive);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!extensions.includes(ext)) continue;
    yield { full, name: entry.name };
  }
}

/**
 * Resolve a folder prop that may be a plain path string, a `file:` URI, or a
 * folder asset ref (`{ type: "folder", uri }`) into a filesystem path.
 */
function resolveFolderPath(raw: unknown): string {
  if (typeof raw === "string" && raw.length > 0) {
    return raw.startsWith("file:") ? uriToPath(raw) : raw;
  }
  if (
    raw &&
    typeof raw === "object" &&
    typeof (raw as { uri?: unknown }).uri === "string" &&
    (raw as { uri: string }).uri.length > 0
  ) {
    return uriToPath((raw as { uri: string }).uri);
  }
  return "";
}

function dateName(name: string): string {
  const now = new Date();
  const pad = (v: number): string => String(v).padStart(2, "0");
  return name
    .replaceAll("%Y", String(now.getFullYear()))
    .replaceAll("%m", pad(now.getMonth() + 1))
    .replaceAll("%d", pad(now.getDate()))
    .replaceAll("%H", pad(now.getHours()))
    .replaceAll("%M", pad(now.getMinutes()))
    .replaceAll("%S", pad(now.getSeconds()));
}

function getModelConfig(props: Record<string, unknown>): {
  providerId: string;
  modelId: string;
} {
  const model = (props.model ?? {}) as Record<string, unknown>;
  if (typeof model === "string") {
    return { providerId: "", modelId: model };
  }
  return {
    providerId: typeof model.provider === "string" ? model.provider : "",
    modelId: typeof model.id === "string" ? model.id : ""
  };
}

function hasProviderSupport(
  context: ProcessingContext | undefined,
  providerId: string,
  modelId: string
): context is ProcessingContext & {
  runProviderPrediction: (req: Record<string, unknown>) => Promise<unknown>;
  streamProviderPrediction: (
    req: Record<string, unknown>
  ) => AsyncGenerator<unknown>;
} {
  return (
    !!context &&
    typeof context.runProviderPrediction === "function" &&
    typeof context.streamProviderPrediction === "function" &&
    !!providerId &&
    !!modelId
  );
}

export class LoadAudioAssetsNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.LoadAudioAssets";
  static readonly platforms = NODE_ONLY;
  static readonly title = "Load Audio Assets";
  static readonly description =
    "Load audio files from an asset folder.\n    load, audio, file, import";
  static readonly metadataOutputTypes = {
    audio: "audio",
    name: "str",
    audios: "list"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = [];

  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    audio: { kind: "iteration", source: "__execution__", group: "items" },
    name: { kind: "iteration", source: "__execution__", group: "items" },
    audios: { kind: "single", source: "__execution__" }
  };

  @prop({
    type: "folder",
    default: {
      type: "folder",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Folder",
    description: "The asset folder to load the audio files from."
  })
  declare folder: any;

  async process(): Promise<Record<string, unknown>> {
    const collected: Record<string, unknown>[] = [];
    const names: string[] = [];
    for await (const item of this._loadAudios()) {
      collected.push(item.audio as Record<string, unknown>);
      names.push(String(item.name ?? ""));
    }
    return {
      audio: collected[0] ?? {},
      name: names[0] ?? "",
      audios: collected
    };
  }

  private async *_loadAudios(): AsyncGenerator<Record<string, unknown>> {
    const folder = resolveFolderPath(this.folder);
    if (!folder) return;
    const fs = await loadNodeFsPromises();
    for await (const { full, name } of walkAudioFiles(
      folder,
      DEFAULT_AUDIO_EXTENSIONS,
      false
    )) {
      const data = new Uint8Array(await fs.readFile(full));
      yield {
        audio: audioRefFromBytes(data, `file://${full}`),
        name
      };
    }
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const collected: Record<string, unknown>[] = [];
    for await (const item of this._loadAudios()) {
      collected.push(item.audio as Record<string, unknown>);
      yield item;
    }
    yield { audios: collected };
  }
}

export class LoadAudioFileNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.LoadAudioFile";
  static readonly platforms = NODE_ONLY;
  static readonly title = "Load Audio File";
  static readonly description =
    "Read an audio file from disk.\n    audio, input, load, file";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = [];

  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Path to the audio file to read"
  })
  declare path: any;

  async process(): Promise<Record<string, unknown>> {
    const p = uriToPath(String(this.path ?? ""));
    const fs = await loadNodeFsPromises();
    const data = new Uint8Array(await fs.readFile(p));
    return { output: audioRefFromBytes(data, `file://${p}`) };
  }
}

export class LoadAudioFolderNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.LoadAudioFolder";
  static readonly platforms = NODE_ONLY;
  static readonly title = "Load Audio Folder";
  static readonly description =
    "Load all audio files from a folder, optionally including subfolders.\n    audio, load, folder, files";
  static readonly metadataOutputTypes = {
    audio: "audio",
    path: "str",
    audios: "list"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = [];

  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    audio: { kind: "iteration", source: "__execution__", group: "items" },
    path: { kind: "iteration", source: "__execution__", group: "items" },
    audios: { kind: "single", source: "__execution__" }
  };

  @prop({
    type: "str",
    default: "",
    title: "Folder",
    description: "Folder to scan for audio files"
  })
  declare folder: any;

  @prop({
    type: "bool",
    default: false,
    title: "Include Subdirectories",
    description: "Include audio in subfolders"
  })
  declare include_subdirectories: any;

  @prop({
    type: "list[str]",
    default: [".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac"],
    title: "Extensions",
    description: "Audio file extensions to include"
  })
  declare extensions: any;

  private _extensions(): string[] {
    const list = Array.isArray(this.extensions)
      ? (this.extensions as unknown[])
      : DEFAULT_AUDIO_EXTENSIONS;
    return list.map((e) => {
      const s = String(e).toLowerCase();
      return s.startsWith(".") ? s : `.${s}`;
    });
  }

  private async *_load(): AsyncGenerator<Record<string, unknown>> {
    const folder = resolveFolderPath(this.folder);
    if (!folder) return;
    const recursive = Boolean(this.include_subdirectories);
    const extensions = this._extensions();
    const fs = await loadNodeFsPromises();
    for await (const { full } of walkAudioFiles(
      folder,
      extensions,
      recursive
    )) {
      const data = new Uint8Array(await fs.readFile(full));
      yield { audio: audioRefFromBytes(data, `file://${full}`), path: full };
    }
  }

  async process(): Promise<Record<string, unknown>> {
    const collected: Record<string, unknown>[] = [];
    const paths: string[] = [];
    for await (const item of this._load()) {
      collected.push(item.audio as Record<string, unknown>);
      paths.push(String(item.path ?? ""));
    }
    return { audio: collected[0] ?? {}, path: paths[0] ?? "", audios: collected };
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const collected: Record<string, unknown>[] = [];
    for await (const item of this._load()) {
      collected.push(item.audio as Record<string, unknown>);
      yield item;
    }
    yield { audios: collected };
  }
}

export class SaveAudioNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.SaveAudio";
  static readonly platforms = NODE_ONLY;
  static readonly title = "Save Audio Asset";
  static readonly description =
    "Save an audio file to a specified asset folder.\n    audio, folder, name";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["audio"];

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio"
  })
  declare audio: any;

  @prop({
    type: "folder",
    default: {
      type: "folder",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Folder",
    description: "The asset folder to save the audio file to. "
  })
  declare folder: any;

  @prop({
    type: "str",
    default: "%Y-%m-%d-%H-%M-%S.wav",
    title: "Name",
    description:
      "\n        The name of the audio file.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        "
  })
  declare name: any;

  async process(): Promise<Record<string, unknown>> {
    const audio = this.audio;
    const folder = resolveFolderPath(this.folder) || ".";
    const name = dateName(String(this.name || "audio.wav"));
    const fs = await loadNodeFsPromises();
    const path = await loadNodePath();
    const full = path.resolve(folder, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, audioBytes(audio));
    return { output: audioRefFromBytes(audioBytes(audio), `file://${full}`) };
  }
}

export class SaveAudioFileNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.SaveAudioFile";
  static readonly platforms = NODE_ONLY;
  static readonly title = "Save Audio File";
  static readonly description =
    "Write an audio file to disk.\n    audio, output, save, file\n\n    The filename can include time and date variables:\n    %Y - Year, %m - Month, %d - Day\n    %H - Hour, %M - Minute, %S - Second\n\n    Supported formats: mp3, wav, ogg, flac, aac, m4a";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["audio"];

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "The audio to save"
  })
  declare audio: any;

  @prop({
    type: "str",
    default: "",
    title: "Folder",
    description: "Folder where the file will be saved"
  })
  declare folder: any;

  @prop({
    type: "str",
    default: "",
    title: "Filename",
    description:
      "\n        Name of the file to save.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        "
  })
  declare filename: any;

  @prop({
    type: "dict[str, str]",
    default: {
      ".mp3": "mp3",
      ".wav": "wav",
      ".ogg": "ogg",
      ".flac": "flac",
      ".aac": "adts",
      ".m4a": "ipod"
    },
    title: "Format Map"
  })
  declare FORMAT_MAP: any;

  async process(): Promise<Record<string, unknown>> {
    const audio = this.audio;
    const folder = String(this.folder || ".");
    const fname = dateName(String(this.filename || "audio.wav"));
    const fs = await loadNodeFsPromises();
    const path = await loadNodePath();
    const p = path.resolve(folder, fname);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, audioBytes(audio));
    return { output: p };
  }
}

export class NormalizeAudioNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.Normalize";
  static readonly title = "Normalize";
  static readonly description =
    "Normalizes the volume of an audio file.\n    audio, fix, dynamics, volume";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["audio"];

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "The audio file to normalize."
  })
  declare audio: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const bytes = await audioBytesAsync(this.audio, context);
    const wav = tryDecodeWav({ data: bytes });
    if (!wav || wav.samples.length === 0) {
      return { output: audioRefFromBytes(bytes) };
    }

    let peak = 0;
    for (const sample of wav.samples) peak = Math.max(peak, Math.abs(sample));
    if (peak === 0) return { output: audioRefFromBytes(bytes) };

    const gain = 1 / peak;
    const normalized = new Float32Array(wav.samples.length);
    for (let i = 0; i < wav.samples.length; i += 1) {
      normalized[i] = wav.samples[i] * gain;
    }
    return {
      output: audioRefFromWav(
        encodeWav(normalized, wav.sampleRate, wav.numChannels)
      )
    };
  }
}

export class OverlayAudioNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.OverlayAudio";
  static readonly title = "Overlay Audio";
  static readonly description =
    "Overlays two audio files together.\n    audio, edit, transform";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["a", "b"];

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "A",
    description: "The first audio file."
  })
  declare a: any;

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "B",
    description: "The second audio file."
  })
  declare b: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const aBytes = await audioBytesAsync(this.a, context);
    const bBytes = await audioBytesAsync(this.b, context);
    const aw = parseWavBytes(aBytes);
    const bw = parseWavBytes(bBytes);

    // When both inputs are WAV with matching layout, overlay = sum the
    // samples (encodeWav clips to [-1, 1]) so the result stays playable.
    if (
      aw &&
      bw &&
      aw.sampleRate === bw.sampleRate &&
      aw.numChannels === bw.numChannels
    ) {
      const len = Math.max(aw.samples.length, bw.samples.length);
      const mixed = new Float32Array(len);
      for (let i = 0; i < len; i += 1) {
        mixed[i] = (aw.samples[i] ?? 0) + (bw.samples[i] ?? 0);
      }
      return {
        output: audioRefFromWav(
          encodeWav(mixed, aw.sampleRate, aw.numChannels)
        )
      };
    }

    // Fallback: byte-level max for non-WAV / mismatched inputs.
    const len = Math.max(aBytes.length, bBytes.length);
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      out[i] = Math.max(aBytes[i] ?? 0, bBytes[i] ?? 0);
    }
    return { output: audioRefFromBytes(out) };
  }
}

export class RemoveSilenceNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.RemoveSilence";
  static readonly title = "Remove Silence";
  static readonly description =
    "Removes or shortens silence in an audio file with smooth transitions.\n    audio, edit, clean";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["audio"];

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "The audio file to process."
  })
  declare audio: any;

  @prop({
    type: "int",
    default: 200,
    title: "Min Length",
    description: "Minimum length of silence to be processed (in milliseconds).",
    min: 0,
    max: 10000
  })
  declare min_length: any;

  @prop({
    type: "int",
    default: -40,
    title: "Threshold",
    description:
      "Silence threshold in dB (relative to full scale). Higher values detect more silence.",
    min: -60,
    max: 0
  })
  declare threshold: any;

  @prop({
    type: "float",
    default: 1,
    title: "Reduction Factor",
    description:
      "Factor to reduce silent parts (0.0 to 1.0). 0.0 keeps silence as is, 1.0 removes it completely.",
    min: 0,
    max: 1
  })
  declare reduction_factor: any;

  @prop({
    type: "int",
    default: 10,
    title: "Crossfade",
    description:
      "Duration of crossfade in milliseconds to apply between segments for smooth transitions.",
    min: 0,
    max: 50
  })
  declare crossfade: any;

  @prop({
    type: "int",
    default: 100,
    title: "Min Silence Between Parts",
    description:
      "Minimum silence duration in milliseconds to maintain between non-silent segments",
    min: 0,
    max: 500
  })
  declare min_silence_between_parts: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const bytes = await audioBytesAsync(this.audio, context);
    const wav = parseWavBytes(bytes);
    if (!wav || wav.samples.length === 0) {
      return { output: audioRefFromBytes(bytes) };
    }

    const { sampleRate, numChannels } = wav;
    const frames = wavFrameCount(wav);
    const thresholdDb = Number(this.threshold ?? -40);
    const minLenMs = Math.max(0, Number(this.min_length ?? 200));
    const reduction = Math.min(1, Math.max(0, Number(this.reduction_factor ?? 1)));
    const minGapMs = Math.max(0, Number(this.min_silence_between_parts ?? 100));
    const crossfadeMs = Math.max(0, Number(this.crossfade ?? 10));

    const thresholdLin = Math.pow(10, thresholdDb / 20);
    const minLenFrames = Math.round((minLenMs / 1000) * sampleRate);
    const minGapFrames = Math.round((minGapMs / 1000) * sampleRate);
    const crossfadeFrames = Math.round((crossfadeMs / 1000) * sampleRate);

    const isSilent = (f: number): boolean => {
      let amp = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        amp = Math.max(amp, Math.abs(wav.samples[f * numChannels + ch]));
      }
      return amp < thresholdLin;
    };

    // Collect the source frame indices to keep, shortening long silences.
    const kept: number[] = [];
    let f = 0;
    while (f < frames) {
      if (!isSilent(f)) {
        kept.push(f);
        f += 1;
        continue;
      }
      const runStart = f;
      while (f < frames && isSilent(f)) f += 1;
      const runLen = f - runStart;
      if (runLen < minLenFrames) {
        for (let k = runStart; k < f; k++) kept.push(k);
      } else {
        let keep = Math.round(runLen * (1 - reduction));
        // Preserve a minimum gap between non-silent segments.
        if (kept.length > 0 && f < frames) keep = Math.max(keep, minGapFrames);
        keep = Math.min(keep, runLen);
        for (let k = 0; k < keep; k++) kept.push(runStart + k);
      }
    }

    if (kept.length === frames) {
      return {
        output: audioRefFromWav(
          encodeWav(wav.samples, sampleRate, numChannels)
        )
      };
    }

    const out = new Float32Array(kept.length * numChannels);
    for (let i = 0; i < kept.length; i++) {
      const src = kept[i];
      for (let ch = 0; ch < numChannels; ch++) {
        out[i * numChannels + ch] = wav.samples[src * numChannels + ch];
      }
    }

    // Smooth the splices: short fades on either side of each discontinuity
    // (where consecutive kept frames are not adjacent in the source) to avoid
    // audible clicks.
    if (crossfadeFrames > 0) {
      for (let i = 1; i < kept.length; i++) {
        if (kept[i] === kept[i - 1] + 1) continue;
        for (let k = 0; k < crossfadeFrames; k++) {
          const g = (k + 1) / (crossfadeFrames + 1);
          const before = i - 1 - k;
          const after = i + k;
          if (before >= 0) {
            for (let ch = 0; ch < numChannels; ch++) {
              out[before * numChannels + ch] *= g;
            }
          }
          if (after < kept.length) {
            for (let ch = 0; ch < numChannels; ch++) {
              out[after * numChannels + ch] *= g;
            }
          }
        }
      }
    }

    return {
      output: audioRefFromWav(encodeWav(out, sampleRate, numChannels))
    };
  }
}

export class SliceAudioNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.SliceAudio";
  static readonly title = "Slice Audio";
  static readonly description =
    "Extracts a section of an audio file.\n    audio, edit, trim";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["audio"];

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "The audio file."
  })
  declare audio: any;

  @prop({
    type: "float",
    default: 0,
    title: "Start",
    description: "The start time in seconds.",
    min: 0
  })
  declare start: any;

  @prop({
    type: "float",
    default: 1,
    title: "End",
    description: "The end time in seconds. 0 or less slices to the end.",
    min: 0
  })
  declare end: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const bytes = await audioBytesAsync(this.audio, context);
    const start = Math.max(0, Number(this.start ?? 0));
    const end = Number(this.end ?? 0);
    const wav = parseWavBytes(bytes);
    if (!wav) {
      // Non-WAV: fall back to raw byte slicing.
      const e = end <= 0 ? bytes.length : end;
      return { output: audioRefFromBytes(bytes.slice(start, e)) };
    }
    const { sampleRate, numChannels } = wav;
    const frames = wavFrameCount(wav);
    const startFrame = Math.min(frames, Math.round(start * sampleRate));
    const endFrame =
      end <= 0 ? frames : Math.min(frames, Math.round(end * sampleRate));
    const sliced = wav.samples.slice(
      startFrame * numChannels,
      Math.max(startFrame, endFrame) * numChannels
    );
    return {
      output: audioRefFromWav(encodeWav(sliced, sampleRate, numChannels))
    };
  }
}

export class MonoToStereoNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.MonoToStereo";
  static readonly title = "Mono To Stereo";
  static readonly description =
    "Converts a mono audio signal to stereo.\n    audio, convert, channels";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["audio"];

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "The mono audio file to convert."
  })
  declare audio: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const bytes = await audioBytesAsync(this.audio, context);
    const wav = parseWavBytes(bytes);
    if (!wav) {
      // Non-WAV fallback: duplicate raw bytes.
      const out = new Uint8Array(bytes.length * 2);
      for (let i = 0; i < bytes.length; i += 1) {
        out[i * 2] = bytes[i];
        out[i * 2 + 1] = bytes[i];
      }
      return { output: audioRefFromBytes(out) };
    }
    // Already stereo (or more): pass through unchanged.
    if (wav.numChannels >= 2) {
      return {
        output: audioRefFromWav(
          encodeWav(wav.samples, wav.sampleRate, wav.numChannels)
        )
      };
    }
    const frames = wav.samples.length;
    const out = new Float32Array(frames * 2);
    for (let i = 0; i < frames; i += 1) {
      out[i * 2] = wav.samples[i];
      out[i * 2 + 1] = wav.samples[i];
    }
    return { output: audioRefFromWav(encodeWav(out, wav.sampleRate, 2)) };
  }
}

export class StereoToMonoNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.StereoToMono";
  static readonly title = "Stereo To Mono";
  static readonly description =
    "Converts a stereo audio signal to mono.\n    audio, convert, channels";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["audio"];

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "The stereo audio file to convert."
  })
  declare audio: any;

  @prop({
    type: "str",
    default: "average",
    title: "Method",
    description: "Method to use for conversion: 'average', 'left', or 'right'."
  })
  declare method: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const bytes = await audioBytesAsync(this.audio, context);
    const method = String(this.method ?? "average");
    const wav = parseWavBytes(bytes);
    if (!wav) {
      // Non-WAV fallback: keep every other byte.
      const out = new Uint8Array(Math.ceil(bytes.length / 2));
      for (let i = 0, j = 0; i < bytes.length; i += 2, j += 1) {
        out[j] = bytes[i];
      }
      return { output: audioRefFromBytes(out) };
    }
    const numChannels = wav.numChannels;
    // Already mono: pass through unchanged.
    if (numChannels <= 1) {
      return {
        output: audioRefFromWav(encodeWav(wav.samples, wav.sampleRate, 1))
      };
    }
    const frames = wavFrameCount(wav);
    const out = new Float32Array(frames);
    for (let f = 0; f < frames; f += 1) {
      const base = f * numChannels;
      if (method === "left") {
        out[f] = wav.samples[base];
      } else if (method === "right") {
        out[f] = wav.samples[base + 1];
      } else {
        let sum = 0;
        for (let ch = 0; ch < numChannels; ch++) sum += wav.samples[base + ch];
        out[f] = sum / numChannels;
      }
    }
    return { output: audioRefFromWav(encodeWav(out, wav.sampleRate, 1)) };
  }
}

export class ReverseAudioNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.Reverse";
  static readonly title = "Reverse";
  static readonly description =
    "Reverses an audio file.\n    audio, edit, transform";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["audio"];

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "The audio file to reverse."
  })
  declare audio: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const bytes = await audioBytesAsync(this.audio, context);
    const wav = parseWavBytes(bytes);
    if (!wav) {
      // Non-WAV fallback: reverse raw bytes.
      return { output: audioRefFromBytes(new Uint8Array([...bytes].reverse())) };
    }
    const { sampleRate, numChannels } = wav;
    const frames = wavFrameCount(wav);
    const out = new Float32Array(wav.samples.length);
    for (let f = 0; f < frames; f += 1) {
      const src = frames - 1 - f;
      for (let ch = 0; ch < numChannels; ch++) {
        out[f * numChannels + ch] = wav.samples[src * numChannels + ch];
      }
    }
    return {
      output: audioRefFromWav(encodeWav(out, sampleRate, numChannels))
    };
  }
}

export class FadeInAudioNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.FadeIn";
  static readonly title = "Fade In";
  static readonly description =
    "Applies a fade-in effect to the beginning of an audio file.\n    audio, edit, transition";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["audio"];

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "The audio file to apply fade-in to."
  })
  declare audio: any;

  @prop({
    type: "float",
    default: 1,
    title: "Duration",
    description: "Duration of the fade-in effect in seconds.",
    min: 0
  })
  declare duration: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const bytes = await audioBytesAsync(this.audio, context);
    const duration = Math.max(0, Number(this.duration ?? 1));
    const wav = parseWavBytes(bytes);
    if (!wav) return { output: audioRefFromBytes(bytes) };
    const { sampleRate, numChannels } = wav;
    const frames = wavFrameCount(wav);
    const fadeFrames = Math.min(frames, Math.round(duration * sampleRate));
    const out = new Float32Array(wav.samples);
    for (let f = 0; f < fadeFrames; f += 1) {
      const gain = fadeFrames > 0 ? f / fadeFrames : 1;
      for (let ch = 0; ch < numChannels; ch++) {
        out[f * numChannels + ch] *= gain;
      }
    }
    return {
      output: audioRefFromWav(encodeWav(out, sampleRate, numChannels))
    };
  }
}

export class FadeOutAudioNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.FadeOut";
  static readonly title = "Fade Out";
  static readonly description =
    "Applies a fade-out effect to the end of an audio file.\n    audio, edit, transition";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["audio"];

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "The audio file to apply fade-out to."
  })
  declare audio: any;

  @prop({
    type: "float",
    default: 1,
    title: "Duration",
    description: "Duration of the fade-out effect in seconds.",
    min: 0
  })
  declare duration: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const bytes = await audioBytesAsync(this.audio, context);
    const duration = Math.max(0, Number(this.duration ?? 1));
    const wav = parseWavBytes(bytes);
    if (!wav) return { output: audioRefFromBytes(bytes) };
    const { sampleRate, numChannels } = wav;
    const frames = wavFrameCount(wav);
    const fadeFrames = Math.min(frames, Math.round(duration * sampleRate));
    const out = new Float32Array(wav.samples);
    const startFrame = frames - fadeFrames;
    for (let f = startFrame; f < frames; f += 1) {
      const gain = fadeFrames > 0 ? (frames - f) / fadeFrames : 1;
      for (let ch = 0; ch < numChannels; ch++) {
        out[f * numChannels + ch] *= gain;
      }
    }
    return {
      output: audioRefFromWav(encodeWav(out, sampleRate, numChannels))
    };
  }
}

export class RepeatAudioNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.Repeat";
  static readonly title = "Repeat";
  static readonly description =
    "Loops an audio file a specified number of times.\n    audio, edit, repeat";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["audio"];

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "The audio file to loop."
  })
  declare audio: any;

  @prop({
    type: "int",
    default: 2,
    title: "Loops",
    description:
      "Number of times to loop the audio. Minimum 1 (plays once), maximum 100.",
    min: 1,
    max: 100
  })
  declare loops: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const bytes = await audioBytesAsync(this.audio, context);
    const count = Math.max(1, Math.floor(Number(this.loops ?? 2)));
    const wav = parseWavBytes(bytes);
    if (!wav) {
      // Non-WAV fallback: repeat raw bytes.
      return {
        output: audioRefFromBytes(
          concatBytes(Array.from({ length: count }, () => bytes))
        )
      };
    }
    const out = new Float32Array(wav.samples.length * count);
    for (let r = 0; r < count; r += 1) {
      out.set(wav.samples, r * wav.samples.length);
    }
    return {
      output: audioRefFromWav(
        encodeWav(out, wav.sampleRate, wav.numChannels)
      )
    };
  }
}

export class AudioMixerNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.AudioMixer";
  static readonly body = "content_card";
  static readonly title = "Audio Mixer";
  static readonly description =
    "Mix multiple audio tracks together. Add tracks dynamically with the “add audio input” button; wire a Gain node upstream of any track that needs a different level.\n    audio, mix, combine, blend, layer, add, overlay";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = [];
  static readonly supportsDynamicInputs = true;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const inputs = Array.from(this.dynamicProps.values()).filter(
      (t) => t && typeof t === "object"
    );

    const tracks = (
      await Promise.all(inputs.map((t) => audioBytesAsync(t, context)))
    ).filter((bytes) => bytes.length > 0);

    if (tracks.length === 0)
      return { output: audioRefFromBytes(new Uint8Array()) };

    // If every track is a valid WAV file with a matching layout, mix in
    // Float32 sample space and emit a valid WAV so downstream nodes receive a
    // playable file. Index-based mixing only lines up when sample rate and
    // channel count match across tracks.
    const parsed = tracks.map((bytes) => ({
      wav: tryDecodeWav({ data: bytes }),
      bytes
    }));
    const uniformWav =
      parsed.every((p) => p.wav !== null) &&
      parsed.every(
        (p) =>
          p.wav!.sampleRate === parsed[0].wav!.sampleRate &&
          p.wav!.numChannels === parsed[0].wav!.numChannels
      );
    if (uniformWav) {
      const wavs = parsed as Array<{ wav: WavData; bytes: Uint8Array }>;
      const len = Math.max(...wavs.map((p) => p.wav.samples.length));
      const mixed = new Float32Array(len);
      for (let i = 0; i < len; i += 1) {
        let total = 0;
        for (const p of wavs) total += p.wav.samples[i] ?? 0;
        mixed[i] = total / wavs.length;
      }
      return {
        output: audioRefFromWav(
          encodeWav(mixed, wavs[0].wav.sampleRate, wavs[0].wav.numChannels)
        )
      };
    }

    // Fallback: byte-level averaging (preserves backward-compatible
    // behavior for non-WAV / headerless byte streams).
    const len = Math.max(...tracks.map((bytes) => bytes.length));
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      let total = 0;
      for (const bytes of tracks) total += bytes[i] ?? 0;
      out[i] = Math.max(0, Math.min(255, Math.round(total / tracks.length)));
    }
    return { output: audioRefFromBytes(out) };
  }
}

export class TrimAudioNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.Trim";
  static readonly title = "Trim";
  static readonly description =
    "Trim an audio file to a specified duration.\n    audio, trim, cut";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["audio"];

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "The audio file to trim."
  })
  declare audio: any;

  @prop({
    type: "float",
    default: 0,
    title: "Start",
    description: "The start time of the trimmed audio in seconds.",
    min: 0
  })
  declare start: any;

  @prop({
    type: "float",
    default: 0,
    title: "End",
    description: "The end time of the trimmed audio in seconds.",
    min: 0
  })
  declare end: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const bytes = await audioBytesAsync(this.audio, context);
    const start = Math.max(0, Number(this.start ?? 0));
    const end = Math.max(0, Number(this.end ?? 0));
    const wav = parseWavBytes(bytes);
    if (!wav) {
      // Non-WAV fallback: treat start/end as raw byte offsets.
      const e = end > 0 ? Math.max(start, end) : bytes.length;
      return { output: audioRefFromBytes(bytes.slice(start, e)) };
    }
    const { sampleRate, numChannels } = wav;
    const frames = wavFrameCount(wav);
    // start/end are absolute times in seconds; end <= 0 means "to the end".
    const startFrame = Math.min(frames, Math.round(start * sampleRate));
    const endFrame =
      end > 0 ? Math.min(frames, Math.round(end * sampleRate)) : frames;
    const trimmed = wav.samples.slice(
      startFrame * numChannels,
      Math.max(startFrame, endFrame) * numChannels
    );
    return {
      output: audioRefFromWav(encodeWav(trimmed, sampleRate, numChannels))
    };
  }
}

export class CreateSilenceNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.CreateSilence";
  static readonly title = "Create Silence";
  static readonly description =
    "Creates a silent audio file with a specified duration.\n    audio, silence, empty";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = [];

  @prop({
    type: "float",
    default: 1,
    title: "Duration",
    description: "The duration of the silence in seconds.",
    min: 0
  })
  declare duration: any;

  @prop({
    type: "int",
    default: 44100,
    title: "Sample Rate",
    description: "Sample rate of the generated silence in Hz.",
    min: 1
  })
  declare sample_rate: any;

  async process(): Promise<Record<string, unknown>> {
    const duration = Math.max(0, Number(this.duration ?? 1));
    const sampleRate = Math.max(1, Math.floor(Number(this.sample_rate ?? 44100)));
    const frames = Math.round(duration * sampleRate);
    return {
      output: audioRefFromWav(
        encodeWav(new Float32Array(frames), sampleRate, 1)
      )
    };
  }
}

export class ConcatAudioNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.Concat";
  static readonly body = "content_card";
  static readonly title = "Concatenate Audio";
  static readonly description =
    "Concatenates audio files together. Add inputs dynamically with the “add audio input” button.\n    audio, edit, join, +";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = [];
  static readonly supportsDynamicInputs = true;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const values = Array.from(this.dynamicProps.values());
    const parts = (
      await Promise.all(values.map((v) => audioBytesAsync(v, context)))
    ).filter((b) => b.length > 0);
    return { output: concatAudio(parts) };
  }
}

type AudioRefResult = ReturnType<typeof audioRefFromBytes>;

/**
 * Concatenate audio byte buffers. When every part is a WAV with a matching
 * layout, decode and join in sample space so the result is a single valid
 * WAV; otherwise fall back to raw byte concatenation.
 */
function concatAudio(parts: Uint8Array[]): AudioRefResult {
  if (parts.length === 0) return audioRefFromBytes(new Uint8Array());
  const wavs = parts.map((b) => parseWavBytes(b));
  const uniform =
    wavs.every((w) => w !== null) &&
    wavs.every(
      (w) =>
        w!.sampleRate === wavs[0]!.sampleRate &&
        w!.numChannels === wavs[0]!.numChannels
    );
  if (uniform) {
    const list = wavs as WavData[];
    const total = list.reduce((s, w) => s + w.samples.length, 0);
    const out = new Float32Array(total);
    let pos = 0;
    for (const w of list) {
      out.set(w.samples, pos);
      pos += w.samples.length;
    }
    return audioRefFromWav(
      encodeWav(out, list[0].sampleRate, list[0].numChannels)
    );
  }
  return audioRefFromBytes(concatBytes(parts));
}

export class ConcatAudioListNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.ConcatList";
  static readonly title = "Concatenate Audio List";
  static readonly description =
    "Concatenates multiple audio files together in sequence.\n    audio, edit, join, multiple, +";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["audio_files"];

  @prop({
    type: "list[audio]",
    default: [],
    title: "Audio Files",
    description: "List of audio files to concatenate in sequence."
  })
  declare audio_files: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const audios = Array.isArray(this.audio_files)
      ? (this.audio_files as unknown[])
      : [];
    const parts = (
      await Promise.all(audios.map((a) => audioBytesAsync(a, context)))
    ).filter((b) => b.length > 0);
    return { output: concatAudio(parts) };
  }
}

export class TextToSpeechNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.TextToSpeech";
  static readonly body = "content_card";
  static readonly title = "Text To Speech";
  static readonly description =
    "Generate speech audio from text using any supported TTS provider. Automatically routes to the appropriate backend (OpenAI, HuggingFace, MLX).\n    audio, generation, AI, text-to-speech, tts, voice";
  static readonly metadataOutputTypes = {
    audio: "audio",
    chunk: "chunk"
  };
  static readonly inlineFields: string[] = ["text"];
  static readonly inputFields: string[] = ["text"];
  static readonly autoSaveAsset = true;

  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    audio: { kind: "single", source: "__execution__" },
    // `chunk` is declared on the output schema but the current process()
    // accumulates and returns only `audio`. PR 1 classifies it as single
    // (aspirational) per the design's stale-chunk-port guidance; a follow-up
    // either makes the node stream real chunks or removes the handle.
    chunk: { kind: "single", source: "__execution__" }
  };

  @prop({
    type: "tts_model",
    default: {
      type: "tts_model",
      provider: "openai",
      id: "tts-1",
      name: "TTS 1",
      path: null,
      voices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
      selected_voice: "alloy"
    },
    title: "Model",
    description: "The text-to-speech model to use"
  })
  declare model: any;

  @prop({
    type: "str",
    default: "Hello! This is a text-to-speech demonstration.",
    title: "Text",
    description: "Text to convert to speech"
  })
  declare text: any;

  @prop({
    type: "float",
    default: 1,
    title: "Speed",
    description: "Speech speed multiplier (0.25 to 4.0)",
    min: 0.25,
    max: 4
  })
  declare speed: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const text = String(this.text ?? "");
    const { providerId, modelId } = getModelConfig(this.serialize());
    const modelObj = (this.model ?? {}) as Record<string, unknown>;
    const explicitVoice =
      typeof modelObj.selected_voice === "string"
        ? modelObj.selected_voice
        : "";
    const voiceList = Array.isArray(modelObj.voices)
      ? (modelObj.voices as string[])
      : [];
    const voice = explicitVoice || voiceList[0] || "";
    if (hasProviderSupport(context, providerId, modelId)) {
      const chunks: Uint8Array[] = [];
      let sampleRate = 24000;
      for await (const item of context.streamProviderPrediction({
        provider: providerId,
        capability: "text_to_speech",
        model: modelId,
        params: {
          text,
          voice,
          speed: this.speed
        }
      })) {
        const piece = item as { samples?: Int16Array; sampleRate?: number };
        if (typeof piece.sampleRate === "number" && piece.sampleRate > 0) {
          sampleRate = piece.sampleRate;
        }
        if (piece.samples instanceof Int16Array) {
          chunks.push(
            new Uint8Array(
              piece.samples.buffer.slice(
                piece.samples.byteOffset,
                piece.samples.byteOffset + piece.samples.byteLength
              )
            )
          );
        }
      }
      const wav = encodePcm16Wav(concatBytes(chunks), sampleRate, 1);
      return { audio: audioRefFromWav(wav) };
    }
    throw new Error(
      `Text To Speech requires a TTS provider; no provider available for ` +
        `provider "${providerId}" / model "${modelId}".`
    );
  }
}

export class ChunkToAudioNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.ChunkToAudio";
  static readonly title = "Chunk To Audio";
  static readonly description =
    "Converts audio chunks from an input stream into AudioRef objects.\n    audio, stream, chunk, convert";
  static readonly metadataOutputTypes = {
    audio: "audio"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["chunk"];

  @prop({
    type: "chunk",
    default: {
      type: "chunk",
      node_id: null,
      thread_id: null,
      workflow_id: null,
      content_type: "text",
      content: "",
      content_metadata: {},
      done: false,
      thinking: false
    },
    title: "Chunk",
    description: "Stream of audio chunks"
  })
  declare chunk: any;

  async process(): Promise<Record<string, unknown>> {
    const chunk = this.chunk;
    if (chunk && typeof chunk === "object") {
      const c = chunk as {
        data?: Uint8Array | string;
        uri?: string;
        content?: unknown;
        content_type?: string;
      };
      // Audio chunks (e.g. from streaming TTS providers) carry base64 bytes
      // in `content` with content_type "audio"; legacy refs use `data`/`uri`.
      if (c.data) {
        return { audio: audioRefFromBytes(toBytes(c.data)) };
      }
      if (
        c.content_type === "audio" &&
        typeof c.content === "string" &&
        c.content.length > 0
      ) {
        return { audio: audioRefFromBytes(toBytes(c.content)) };
      }
      if (typeof c.uri === "string" && c.uri.length > 0) {
        return { audio: { type: "audio", uri: c.uri, data: "" } };
      }
    }
    return { audio: audioRefFromBytes(new Uint8Array()) };
  }
}

export class GetAudioInfoNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.GetAudioInfo";
  static readonly title = "Get Audio Info";
  static readonly description =
    "Extract metadata from an audio file: duration, sample rate, channels, format.\n    audio, info, metadata, duration, sample_rate, channels, format";
  static readonly metadataOutputTypes = {
    duration: "float",
    sample_rate: "int",
    channels: "int",
    format: "str",
    size_bytes: "int"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["audio"];

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "The audio to inspect."
  })
  declare audio: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const bytes = await audioBytesAsync(this.audio, context);
    if (bytes.length === 0) {
      return { duration: 0, sample_rate: 0, channels: 0, format: "unknown", size_bytes: 0 };
    }

    let format = "unknown";
    let sampleRate = 0;
    let channels = 0;
    let duration = 0;

    const header = readWavHeader(bytes);
    if (header) {
      format = "wav";
      channels = header.numChannels;
      sampleRate = header.sampleRate;
      const { bitsPerSample, dataSize } = header;
      if (sampleRate > 0 && channels > 0 && bitsPerSample > 0) {
        duration = dataSize / (sampleRate * channels * (bitsPerSample / 8));
      }
    }

    if (format === "unknown" && bytes.length >= 4) {
      if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
        format = "mp3";
      } else if (
        bytes[0] === 0x66 && bytes[1] === 0x4c &&
        bytes[2] === 0x61 && bytes[3] === 0x43
      ) {
        format = "flac";
      } else if (
        bytes[0] === 0x4f && bytes[1] === 0x67 &&
        bytes[2] === 0x67 && bytes[3] === 0x53
      ) {
        format = "ogg";
      }
    }

    return {
      duration: Math.round(duration * 1000) / 1000,
      sample_rate: sampleRate,
      channels,
      format,
      size_bytes: bytes.length
    };
  }
}

export const AUDIO_NODES = tagAsServer([
  LoadAudioAssetsNode,
  LoadAudioFileNode,
  LoadAudioFolderNode,
  SaveAudioNode,
  SaveAudioFileNode,
  NormalizeAudioNode,
  OverlayAudioNode,
  RemoveSilenceNode,
  SliceAudioNode,
  MonoToStereoNode,
  StereoToMonoNode,
  ReverseAudioNode,
  FadeInAudioNode,
  FadeOutAudioNode,
  RepeatAudioNode,
  AudioMixerNode,
  TrimAudioNode,
  CreateSilenceNode,
  ConcatAudioNode,
  ConcatAudioListNode,
  TextToSpeechNode,
  ChunkToAudioNode,
  GetAudioInfoNode
]);
