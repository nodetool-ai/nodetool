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

// Property type -> test value factory
// Only used when the current value is empty/null/default-empty
const TEST_VALUE_MAP: Record<string, () => unknown> = {
  // Asset refs
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
    data: getSilentWav()
  }),
  model_3d: () => ({
    type: "model_3d",
    data: "",
    uri: "",
    format: "glb"
  }),

  // Primitive types
  str: () => "test input",
  int: () => 1,
  float: () => 1.0,
  bool: () => true,
  color: () => "#ff0000",

  // Structured types
  dataframe: () => ({
    type: "dataframe",
    uri: "",
    columns: [
      { name: "name", data_type: "string", description: "" },
      { name: "value", data_type: "float", description: "" }
    ],
    data: [
      ["alice", 1.0],
      ["bob", 2.0]
    ]
  }),
  dict: () => ({ key: "value" }),
  "dict[str, any]": () => ({ key: "value" }),
  "list[any]": () => ["item1", "item2"],
  "list[str]": () => ["hello", "world"],
  np_array: () => ({
    data: [1.0, 2.0, 3.0, 4.0],
    shape: [4],
    dtype: "float32"
  }),
  "union[float, int, np_array]": () => 1.0,
  "union[int, float, np_array]": () => 1,
  image_size: () => ({ width: 64, height: 64 }),
  folder: () => "."
};

/**
 * Check if a property value is effectively empty and should be
 * replaced with a test value.
 */
function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (value === "" || value === 0 || value === false) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    // Asset refs: empty when no data and no uri
    if ("type" in obj) {
      return (!obj.data || obj.data === "") && (!obj.uri || obj.uri === "");
    }
    // Empty objects
    return Object.keys(obj).length === 0;
  }
  return false;
}

/**
 * Fill empty properties with sensible test data.
 * Covers asset refs (image/audio/video), primitives (str/int/float),
 * and structured types (dataframe/dict/list/np_array).
 */
export function applyTestAssets(
  properties: Record<string, unknown>,
  propertyMetadata: { name: string; type: { type: string } | string }[]
): Record<string, unknown> {
  const result = { ...properties };

  for (const prop of propertyMetadata) {
    const propType = typeof prop.type === "string" ? prop.type : prop.type.type;
    const factory = TEST_VALUE_MAP[propType];
    if (!factory) continue;

    if (isEmptyValue(result[prop.name])) {
      result[prop.name] = factory();
    }
  }

  return result;
}
