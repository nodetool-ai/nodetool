/**
 * What produced a generated asset, kept on the asset row itself.
 *
 * An asset that came out of a model is only reproducible if the prompt and the
 * settings travel with it: the ledger row that recorded the call is a separate
 * table with its own retention, and a workflow can be edited after the run. So
 * both write paths — the generation seam in `runtime` and the workflow
 * auto-save in `websocket` — stamp the same shape here, and the asset viewer
 * reads it back to show the prompt and to seed a variant.
 */

/** Char cap for the prompt stored on an asset. */
export const ASSET_PROMPT_MAX_CHARS = 8_000;

/** Char cap for any one string setting. */
export const ASSET_PARAM_MAX_CHARS = 1_000;

/** How many settings are kept; the rest are dropped. */
export const ASSET_PARAM_MAX_KEYS = 40;

/** Settings that are plumbing, not generation parameters. */
const IGNORED_PARAM_KEYS = new Set([
  "prompt",
  "background",
  "output_file",
  "input_file",
  "reference_files",
  "signal"
]);

/** The model and settings one generation ran with. */
export interface AssetGenerationSettings {
  /** Provider id that ran the call ("fal", "openai", …). */
  provider?: string;
  /** Model id passed to the provider. */
  model?: string;
  /** Display name of the model, when the caller had one. */
  model_name?: string;
  /** Provider capability the call used ("text_to_image", …). */
  capability?: string;
  /** Node type that produced the asset, for a workflow run. */
  node_type?: string;
  /** Remaining settings: seed, resolution, guidance, voice, … */
  params?: Record<string, string | number | boolean | Array<string | number | boolean>>;
}

/** The asset-metadata fields this feature owns. */
export interface AssetGenerationMetadata {
  /** The prompt, capped at {@link ASSET_PROMPT_MAX_CHARS}. */
  prompt?: string;
  generation?: AssetGenerationSettings;
}

type ParamValue = string | number | boolean | Array<string | number | boolean>;

function isText(value: unknown): value is string {
  return typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBool(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isScalar(value: unknown): value is string | number | boolean {
  return isBool(value) || isText(value) || isFiniteNumber(value);
}

function isScalarArray(
  value: unknown
): value is Array<string | number | boolean> {
  return Array.isArray(value) && value.length > 0 && value.every(isScalar);
}

function capString(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * Keep a setting only if it survives a round trip through the asset row: a
 * scalar, or an array of them. Bytes, streams, abort signals and nested
 * request objects are not settings and are dropped rather than truncated.
 */
function paramValue(value: unknown): ParamValue | null {
  if (isText(value)) return text(value) ?? null;
  if (isBool(value)) return value;
  if (isFiniteNumber(value)) return value;
  if (isScalarArray(value)) {
    return value.map((item) =>
      isText(item) ? capString(item, ASSET_PARAM_MAX_CHARS) : item
    );
  }
  return null;
}

/** Non-empty trimmed string, capped; undefined when there is nothing to keep. */
function text(value: unknown, max = ASSET_PARAM_MAX_CHARS): string | undefined {
  if (!isText(value)) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? capString(trimmed, max) : undefined;
}

export interface AssetGenerationInput {
  prompt?: unknown;
  provider?: unknown;
  model?: unknown;
  modelName?: unknown;
  capability?: unknown;
  nodeType?: unknown;
  params?: Record<string, unknown> | null;
}

/**
 * Build the metadata fragment for one generated asset. Returns `{}` when
 * nothing worth keeping was passed, so a caller can spread it unconditionally.
 */
export function buildAssetGenerationMetadata(
  input: AssetGenerationInput
): AssetGenerationMetadata {
  const settings: AssetGenerationSettings = {};
  const provider = text(input.provider);
  const model = text(input.model);
  const modelName = text(input.modelName);
  const capability = text(input.capability);
  const nodeType = text(input.nodeType);
  if (provider) settings.provider = provider;
  if (model) settings.model = model;
  if (modelName && modelName !== model) settings.model_name = modelName;
  if (capability) settings.capability = capability;
  if (nodeType) settings.node_type = nodeType;

  const params: Record<string, ParamValue> = {};
  for (const [key, raw] of Object.entries(input.params ?? {})) {
    if (key.startsWith("_") || IGNORED_PARAM_KEYS.has(key)) continue;
    if (Object.keys(params).length >= ASSET_PARAM_MAX_KEYS) break;
    const value = paramValue(raw);
    if (value !== null) params[key] = value;
  }
  if (Object.keys(params).length > 0) settings.params = params;

  const out: AssetGenerationMetadata = {};
  const prompt = text(input.prompt, ASSET_PROMPT_MAX_CHARS);
  if (prompt) out.prompt = prompt;
  if (Object.keys(settings).length > 0) out.generation = settings;
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Read the prompt and settings back off an asset's metadata bag. Everything is
 * re-validated: the row is JSON written by an older build or by a caller that
 * put its own keys there.
 */
export function readAssetGenerationMetadata(
  metadata: unknown
): AssetGenerationMetadata {
  if (!isRecord(metadata)) return {};
  const out: AssetGenerationMetadata = {};
  const prompt = text(metadata.prompt, ASSET_PROMPT_MAX_CHARS);
  if (prompt) out.prompt = prompt;

  const generation = metadata.generation;
  if (!isRecord(generation)) return out;
  const settings: AssetGenerationSettings = {};
  for (const key of ["provider", "model", "model_name", "capability", "node_type"] as const) {
    const value = text(generation[key]);
    if (value) settings[key] = value;
  }
  if (isRecord(generation.params)) {
    const params: Record<string, ParamValue> = {};
    for (const [key, raw] of Object.entries(generation.params)) {
      const value = paramValue(raw);
      if (value !== null) params[key] = value;
    }
    if (Object.keys(params).length > 0) settings.params = params;
  }
  if (Object.keys(settings).length > 0) out.generation = settings;
  return out;
}
