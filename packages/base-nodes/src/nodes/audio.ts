import { BaseNode, prop } from "@nodetool/node-sdk";
import type { AudioRef } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";
import { promises as fs } from "node:fs";
import path from "node:path";

type AudioRefLike = {
  uri?: string;
  data?: Uint8Array | string;
};

type ImageLike = {
  data?: Uint8Array | string;
  uri?: string;
};

function toBytes(value: Uint8Array | string | undefined): Uint8Array {
  if (!value) return new Uint8Array();
  if (value instanceof Uint8Array) return value;
  return Uint8Array.from(Buffer.from(value, "base64"));
}

function audioBytes(audio: unknown): Uint8Array {
  if (!audio || typeof audio !== "object") return new Uint8Array();
  const ref = audio as AudioRefLike;
  if (ref.data) return toBytes(ref.data);
  return new Uint8Array();
}

async function audioBytesAsync(audio: unknown, context?: ProcessingContext): Promise<Uint8Array> {
  if (!audio || typeof audio !== "object") return new Uint8Array();
  const ref = audio as AudioRefLike;
  if (ref.data) return toBytes(ref.data);
  if (typeof ref.uri === "string" && ref.uri) {
    try {
      if (context?.storage) {
        const stored = await context.storage.retrieve(ref.uri);
        if (stored !== null) return new Uint8Array(stored);
      }
      if (ref.uri.startsWith("file://")) {
        return new Uint8Array(await fs.readFile(uriToPath(ref.uri)));
      }
      if (ref.uri.startsWith("http://") || ref.uri.startsWith("https://")) {
        const response = await fetch(ref.uri);
        return new Uint8Array(await response.arrayBuffer());
      }
    } catch {
      return new Uint8Array();
    }
  }
  return new Uint8Array();
}

function uriToPath(uriOrPath: string): string {
  if (uriOrPath.startsWith("file://")) return uriOrPath.slice("file://".length);
  return uriOrPath;
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

function audioRefFromBytes(data: Uint8Array, uri?: string): AudioRef {
  return {
    type: "audio",
    uri: uri ?? "",
    data: Buffer.from(data).toString("base64")
  };
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
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

function parseWavPcm16(
  bytes: Uint8Array
): { samples: Int16Array; headerSize: number } | null {
  if (bytes.length < 44) return null;
  const header = Buffer.from(bytes);
  if (
    header.toString("ascii", 0, 4) !== "RIFF" ||
    header.toString("ascii", 8, 12) !== "WAVE"
  ) {
    return null;
  }
  const dataOffset = 44;
  const pcm = bytes.slice(dataOffset);
  if (pcm.length % 2 !== 0) return null;
  return {
    samples: new Int16Array(
      pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength)
    ),
    headerSize: dataOffset
  };
}

function buildWavFromSamples(
  original: Uint8Array,
  samples: Int16Array,
  headerSize = 44
): Uint8Array {
  if (original.length >= headerSize) {
    const out = new Uint8Array(headerSize + samples.byteLength);
    out.set(original.slice(0, headerSize), 0);
    out.set(
      new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength),
      headerSize
    );
    const view = new DataView(out.buffer);
    view.setUint32(4, out.length - 8, true);
    view.setUint32(40, samples.byteLength, true);
    return out;
  }
  return new Uint8Array(
    samples.buffer.slice(
      samples.byteOffset,
      samples.byteOffset + samples.byteLength
    )
  );
}

export class LoadAudioAssetsNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.LoadAudioAssets";
  static readonly title = "Load Audio Assets";
  static readonly description =
    "Load audio files from an asset folder.\n    load, audio, file, import";
  static readonly metadataOutputTypes = {
    audio: "audio",
    name: "str"
  };

  static readonly isStreamingOutput = true;
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
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const folder = String(this.folder ?? ".");
    const entries = await fs.readdir(folder, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (![".wav", ".mp3", ".m4a", ".flac", ".ogg"].includes(ext)) continue;
      const full = path.join(folder, entry.name);
      const data = new Uint8Array(await fs.readFile(full));
      yield {
        audio: audioRefFromBytes(data, `file://${full}`),
        name: entry.name
      };
    }
  }
}

export class LoadAudioFileNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.LoadAudioFile";
  static readonly title = "Load Audio File";
  static readonly description =
    "Read an audio file from disk.\n    audio, input, load, file";
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Path to the audio file to read"
  })
  declare path: any;

  async process(): Promise<Record<string, unknown>> {
    const p = uriToPath(String(this.path ?? ""));
    const data = new Uint8Array(await fs.readFile(p));
    return { output: audioRefFromBytes(data, `file://${p}`) };
  }
}

export class LoadAudioFolderNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.LoadAudioFolder";
  static readonly title = "Load Audio Folder";
  static readonly description =
    "Load all audio files from a folder, optionally including subfolders.\n    audio, load, folder, files";
  static readonly metadataOutputTypes = {
    audio: "audio",
    path: "str"
  };

  static readonly isStreamingOutput = true;
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

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const loader = new LoadAudioAssetsNode();
    loader.assign({ folder: this.folder ?? "." });
    for await (const item of loader.genProcess()) {
      yield item;
    }
  }
}

export class SaveAudioNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.SaveAudio";
  static readonly title = "Save Audio Asset";
  static readonly description =
    "Save an audio file to a specified asset folder.\n    audio, folder, name";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
  static readonly exposeAsTool = true;

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
    default: "%Y-%m-%d-%H-%M-%S.opus",
    title: "Name",
    description:
      "\n        The name of the audio file.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        "
  })
  declare name: any;

  async process(): Promise<Record<string, unknown>> {
    const audio = this.audio;
    const folder = String(this.folder ?? ".");
    const name = dateName(String(this.name ?? "audio.wav"));
    const full = path.resolve(folder, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, audioBytes(audio));
    return { output: audioRefFromBytes(audioBytes(audio), `file://${full}`) };
  }
}

export class SaveAudioFileNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.SaveAudioFile";
  static readonly title = "Save Audio File";
  static readonly description =
    "Write an audio file to disk.\n    audio, output, save, file\n\n    The filename can include time and date variables:\n    %Y - Year, %m - Month, %d - Day\n    %H - Hour, %M - Minute, %S - Second\n\n    Supported formats: mp3, wav, ogg, flac, aac, m4a";
  static readonly metadataOutputTypes = {
    output: "audio"
  };

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
    const folder = String(this.folder ?? ".");
    const fname = dateName(String(this.filename ?? "audio.wav"));
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
  static readonly exposeAsTool = true;

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
    const audio = this.audio;
    const bytes = await audioBytesAsync(audio, context);
    const wav = parseWavPcm16(bytes);
    if (!wav || wav.samples.length === 0) {
      return { output: audioRefFromBytes(bytes) };
    }

    let peak = 0;
    for (const sample of wav.samples) peak = Math.max(peak, Math.abs(sample));
    if (peak === 0) return { output: audioRefFromBytes(bytes) };

    const gain = 32767 / peak;
    const normalized = new Int16Array(wav.samples.length);
    for (let i = 0; i < wav.samples.length; i += 1) {
      normalized[i] = Math.max(
        -32768,
        Math.min(32767, Math.round(wav.samples[i] * gain))
      );
    }
    return {
      output: audioRefFromBytes(
        buildWavFromSamples(bytes, normalized, wav.headerSize)
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
  static readonly exposeAsTool = true;

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

  async process(): Promise<Record<string, unknown>> {
    const a = audioBytes(this.a);
    const b = audioBytes(this.b);
    const len = Math.max(a.length, b.length);
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      out[i] = Math.max(a[i] ?? 0, b[i] ?? 0);
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
  static readonly exposeAsTool = true;

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

  async process(): Promise<Record<string, unknown>> {
    const data = audioBytes(this.audio);
    const filtered = data.filter((v) => v !== 0);
    return { output: audioRefFromBytes(filtered) };
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
  static readonly exposeAsTool = true;

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
    description: "The end time in seconds.",
    min: 0
  })
  declare end: any;

  async process(): Promise<Record<string, unknown>> {
    const data = audioBytes(this.audio);
    const start = Number(this.start ?? 0);
    let end = Number(this.end ?? -1);
    if (end < 0) end = data.length;
    return { output: audioRefFromBytes(data.slice(start, end)) };
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
  static readonly exposeAsTool = true;

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

  async process(): Promise<Record<string, unknown>> {
    const mono = audioBytes(this.audio);
    const out = new Uint8Array(mono.length * 2);
    for (let i = 0; i < mono.length; i += 1) {
      out[i * 2] = mono[i];
      out[i * 2 + 1] = mono[i];
    }
    return { output: audioRefFromBytes(out) };
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
  static readonly exposeAsTool = true;

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

  async process(): Promise<Record<string, unknown>> {
    const stereo = audioBytes(this.audio);
    const out = new Uint8Array(Math.ceil(stereo.length / 2));
    for (let i = 0, j = 0; i < stereo.length; i += 2, j += 1) {
      out[j] = stereo[i];
    }
    return { output: audioRefFromBytes(out) };
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
  static readonly exposeAsTool = true;

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

  async process(): Promise<Record<string, unknown>> {
    const data = audioBytes(this.audio);
    return { output: audioRefFromBytes(new Uint8Array([...data].reverse())) };
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
  static readonly exposeAsTool = true;

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

  async process(): Promise<Record<string, unknown>> {
    const data = new Uint8Array(audioBytes(this.audio));
    const duration = Math.max(1, Number(this.duration ?? 1024));
    for (let i = 0; i < Math.min(duration, data.length); i += 1) {
      data[i] = Math.floor(data[i] * (i / duration));
    }
    return { output: audioRefFromBytes(data) };
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
  static readonly exposeAsTool = true;

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

  async process(): Promise<Record<string, unknown>> {
    const data = new Uint8Array(audioBytes(this.audio));
    const duration = Math.max(1, Number(this.duration ?? 1024));
    const start = Math.max(0, data.length - duration);
    for (let i = start; i < data.length; i += 1) {
      const factor = (data.length - i) / Math.max(1, data.length - start);
      data[i] = Math.floor(data[i] * factor);
    }
    return { output: audioRefFromBytes(data) };
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
  static readonly exposeAsTool = true;

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

  async process(): Promise<Record<string, unknown>> {
    const data = audioBytes(this.audio);
    const count = Math.max(1, Number(this.loops ?? 2));
    return {
      output: audioRefFromBytes(
        concatBytes(Array.from({ length: count }, () => data))
      )
    };
  }
}

export class AudioMixerNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.AudioMixer";
  static readonly title = "Audio Mixer";
  static readonly description =
    "Mix up to 5 audio tracks together with individual volume controls.\n    audio, mix, volume, combine, blend, layer, add, overlay";
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Track1",
    description: "First audio track to mix."
  })
  declare track1: any;

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Track2",
    description: "Second audio track to mix."
  })
  declare track2: any;

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Track3",
    description: "Third audio track to mix."
  })
  declare track3: any;

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Track4",
    description: "Fourth audio track to mix."
  })
  declare track4: any;

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Track5",
    description: "Fifth audio track to mix."
  })
  declare track5: any;

  @prop({
    type: "float",
    default: 1,
    title: "Volume1",
    description: "Volume for track 1. 1.0 is original volume.",
    min: 0,
    max: 2
  })
  declare volume1: any;

  @prop({
    type: "float",
    default: 1,
    title: "Volume2",
    description: "Volume for track 2. 1.0 is original volume.",
    min: 0,
    max: 2
  })
  declare volume2: any;

  @prop({
    type: "float",
    default: 1,
    title: "Volume3",
    description: "Volume for track 3. 1.0 is original volume.",
    min: 0,
    max: 2
  })
  declare volume3: any;

  @prop({
    type: "float",
    default: 1,
    title: "Volume4",
    description: "Volume for track 4. 1.0 is original volume.",
    min: 0,
    max: 2
  })
  declare volume4: any;

  @prop({
    type: "float",
    default: 1,
    title: "Volume5",
    description: "Volume for track 5. 1.0 is original volume.",
    min: 0,
    max: 2
  })
  declare volume5: any;

  async process(): Promise<Record<string, unknown>> {
    const tracks = [
      this.track1,
      this.track2,
      this.track3,
      this.track4,
      this.track5
    ].filter((t) => t && typeof t === "object");
    const all = tracks.map((a) => audioBytes(a));
    if (all.length === 0)
      return { output: audioRefFromBytes(new Uint8Array()) };
    const len = Math.max(...all.map((x) => x.length));
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      let total = 0;
      for (const a of all) total += a[i] ?? 0;
      out[i] = Math.floor(total / all.length);
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
  static readonly exposeAsTool = true;

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

  async process(): Promise<Record<string, unknown>> {
    const data = audioBytes(this.audio);
    const start = Math.max(0, Number(this.start ?? 0));
    const end = Math.max(0, Number(this.end ?? 0));
    return {
      output: audioRefFromBytes(
        data.slice(start, Math.max(start, data.length - end))
      )
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

  @prop({
    type: "float",
    default: 1,
    title: "Duration",
    description: "The duration of the silence in seconds.",
    min: 0
  })
  declare duration: any;

  async process(): Promise<Record<string, unknown>> {
    const length = Math.max(0, Number(this.duration ?? 16000));
    return { output: audioRefFromBytes(new Uint8Array(length)) };
  }
}

export class ConcatAudioNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.Concat";
  static readonly title = "Concat";
  static readonly description =
    "Concatenates two audio files together.\n    audio, edit, join, +";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
  static readonly exposeAsTool = true;

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

  async process(): Promise<Record<string, unknown>> {
    const a = audioBytes(this.a);
    const b = audioBytes(this.b);
    return { output: audioRefFromBytes(concatBytes([a, b])) };
  }
}

export class ConcatAudioListNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.ConcatList";
  static readonly title = "Concat List";
  static readonly description =
    "Concatenates multiple audio files together in sequence.\n    audio, edit, join, multiple, +";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "list[audio]",
    default: [],
    title: "Audio Files",
    description: "List of audio files to concatenate in sequence."
  })
  declare audio_files: any;

  async process(): Promise<Record<string, unknown>> {
    const audios = Array.isArray(this.audio_files)
      ? (this.audio_files as unknown[])
      : [];
    const merged = concatBytes(audios.map((a) => audioBytes(a)));
    return { output: audioRefFromBytes(merged) };
  }
}

export class TextToSpeechNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.TextToSpeech";
  static readonly title = "Text To Speech";
  static readonly description =
    "Generate speech audio from text using any supported TTS provider. Automatically routes to the appropriate backend (OpenAI, HuggingFace, MLX).\n    audio, generation, AI, text-to-speech, tts, voice";
  static readonly metadataOutputTypes = {
    audio: "audio",
    chunk: "chunk"
  };
  static readonly basicFields = ["model", "text", "voice", "speed"];
  static readonly exposeAsTool = true;

  static readonly isStreamingOutput = true;
  @prop({
    type: "tts_model",
    default: {
      type: "tts_model",
      provider: "openai",
      id: "tts-1",
      name: "TTS 1",
      path: null,
      voices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
      selected_voice: ""
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
    if (hasProviderSupport(context, providerId, modelId)) {
      const chunks: Uint8Array[] = [];
      for await (const item of context.streamProviderPrediction({
        provider: providerId,
        capability: "text_to_speech",
        model: modelId,
        params: {
          text,
          voice: (this.model as Record<string, unknown>)?.selected_voice ?? "",
          speed: this.speed
        }
      })) {
        const piece = item as { samples?: Int16Array };
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
      return { output: audioRefFromBytes(concatBytes(chunks)) };
    }
    const bytes = Uint8Array.from(Buffer.from(text, "utf8"));
    return { output: audioRefFromBytes(bytes) };
  }
}

export class ChunkToAudioNode extends BaseNode {
  static readonly nodeType = "nodetool.audio.ChunkToAudio";
  static readonly title = "Chunk To Audio";
  static readonly description =
    "Aggregates audio chunks from an input stream into AudioRef objects.\n    audio, stream, chunk, aggregate, collect, batch";
  static readonly metadataOutputTypes = {
    audio: "audio"
  };

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

  @prop({
    type: "int",
    default: 50,
    title: "Batch Size",
    description: "Number of chunks to aggregate per output"
  })
  declare batch_size: any;

  async process(): Promise<Record<string, unknown>> {
    const chunk = this.chunk ?? {};
    if (chunk && typeof chunk === "object") {
      const image = chunk as ImageLike;
      if (image.data || image.uri) {
        return { output: audioRefFromBytes(toBytes(image.data)) };
      }
    }
    return { output: audioRefFromBytes(new Uint8Array()) };
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

    if (bytes.length >= 44) {
      const header = Buffer.from(bytes);
      const riff = header.toString("ascii", 0, 4);
      const wave = header.toString("ascii", 8, 12);
      if (riff === "RIFF" && wave === "WAVE") {
        format = "wav";
        channels = header.readUInt16LE(22);
        sampleRate = header.readUInt32LE(24);
        const bitsPerSample = header.readUInt16LE(34);
        const dataSize = header.readUInt32LE(40);
        if (sampleRate > 0 && channels > 0 && bitsPerSample > 0) {
          duration = dataSize / (sampleRate * channels * (bitsPerSample / 8));
        }
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

export const AUDIO_NODES = [
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
] as const;
