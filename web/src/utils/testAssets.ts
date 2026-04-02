/**
 * Minimal test assets for node integration testing.
 * These are tiny valid files encoded as base64 data URIs,
 * used to auto-fill empty asset ref properties so nodes
 * can actually execute without manual file selection.
 */

// 1x1 red PNG (68 bytes)
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

// Minimal WAV: 44100Hz, 16-bit, mono, 0.1s silence (8864 bytes)
function makeSilentWav(): string {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * 0.1);
  const dataSize = numSamples * 2; // 16-bit = 2 bytes per sample
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample

  // data chunk (all zeros = silence)
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const bytes = new Uint8Array(buffer);
  return uint8ToBase64(bytes);
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Cache the generated WAV
let cachedWav: string | null = null;
function getSilentWav(): string {
  if (!cachedWav) cachedWav = makeSilentWav();
  return cachedWav;
}

// Asset type -> property type mapping
const ASSET_TYPE_MAP: Record<string, () => Record<string, unknown>> = {
  image: () => ({
    type: "image",
    data: TINY_PNG_BASE64
  }),
  audio: () => ({
    type: "audio",
    data: getSilentWav()
  }),
  video: () => ({
    type: "video",
    data: getSilentWav() // reuse WAV as minimal binary data
  }),
  model_file: () => ({
    type: "model_file",
    data: "",
    uri: ""
  })
};

/**
 * Fill empty asset ref properties with minimal test data.
 * Detects image/audio/video/document property types and provides
 * tiny valid files so nodes can execute.
 */
export function applyTestAssets(
  properties: Record<string, unknown>,
  propertyMetadata: { name: string; type: { type: string } }[]
): Record<string, unknown> {
  const result = { ...properties };

  for (const prop of propertyMetadata) {
    const propType = prop.type.type;
    const factory = ASSET_TYPE_MAP[propType];
    if (!factory) continue;

    const current = result[prop.name] as
      | Record<string, unknown>
      | null
      | undefined;

    // Check if the asset ref is empty (no data and no uri)
    const isEmpty =
      !current ||
      (!current.data && !current.uri) ||
      (current.data === "" && (!current.uri || current.uri === ""));

    if (isEmpty) {
      result[prop.name] = factory();
    }
  }

  return result;
}
