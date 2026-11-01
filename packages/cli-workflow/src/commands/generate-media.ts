/**
 * The speech and video kinds of `nodetool generate`, and the priced model
 * listing every kind shares.
 *
 * Speech and video run the same `generate_speech` / `generate_video` tools as
 * `nodetool tools call`, through the installed cli-chat feature, so the
 * generation row, the asset and the cost record are the ones that command
 * writes.
 */
import { relative, resolve } from "node:path";
import { getModelUnitPrice } from "@nodetool-ai/model-pricing";

export const GENERATE_KINDS = ["image", "speech", "video"] as const;
export type GenerateKind = (typeof GENERATE_KINDS)[number];

export function parseGenerateKind(value: string | undefined): GenerateKind {
  const kind = (value ?? "image").toLowerCase();
  const alias = kind === "audio" || kind === "tts" ? "speech" : kind;
  const match = GENERATE_KINDS.find((candidate) => candidate === alias);
  if (!match) {
    throw new Error(`Unknown --kind "${value}". Use one of: ${GENERATE_KINDS.join(", ")}.`);
  }
  return match;
}

export interface ListedModel {
  readonly id: string;
  readonly name: string;
}

export interface PricedModel extends ListedModel {
  /** Catalog price in USD for one run, or null when the catalog has none. */
  readonly price: number | null;
  readonly billing_unit: string | null;
}

/**
 * Attach the pricing catalog's price to each model and sort: priced models
 * cheapest first, then unpriced models, each group by name.
 */
export function priceAndSortModels(
  providerId: string,
  models: readonly ListedModel[]
): PricedModel[] {
  const priced = models.map((model) => {
    const quote = getModelUnitPrice({ id: model.id, provider: providerId });
    const usable = quote && !quote.declined && Number.isFinite(quote.unit_price) && quote.unit_price > 0;
    return {
      id: model.id,
      name: model.name,
      price: usable ? quote.unit_price : null,
      billing_unit: usable ? quote.billing_unit || null : null
    };
  });
  const byName = (a: PricedModel, b: PricedModel): number =>
    (a.name || a.id).localeCompare(b.name || b.id) || a.id.localeCompare(b.id);
  return priced.sort((a, b) => {
    if (a.price !== null && b.price !== null) {
      return a.price - b.price || byName(a, b);
    }
    if (a.price !== null) return -1;
    if (b.price !== null) return 1;
    return byName(a, b);
  });
}

/** One line of the text listing: price column, id, and the name when it differs. */
export function formatPricedModel(model: PricedModel): string {
  const price =
    model.price === null
      ? "—"
      : `$${model.price < 0.01 ? model.price.toFixed(4) : model.price.toFixed(3)}${model.billing_unit ? `/${model.billing_unit}` : ""}`;
  const name = model.name && model.name !== model.id ? `  — ${model.name}` : "";
  return `  ${price.padEnd(16)} ${model.id}${name}`;
}

export interface MediaToolOptions {
  readonly output?: string;
  readonly voice?: string;
  readonly speed?: string;
  readonly instructions?: string;
  readonly aspectRatio?: string;
  readonly negativePrompt?: string;
  readonly duration?: string;
  readonly resolution?: string;
}

export interface MediaToolCall {
  readonly tool: "generate_speech" | "generate_video";
  readonly args: Record<string, unknown>;
}

function numberOption(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${flag} must be a number, got "${value}".`);
  return parsed;
}

/** The tool and arguments `nodetool tools call` would take for this request. */
export function mediaToolCall(
  kind: "speech" | "video",
  provider: string,
  model: string,
  prompt: string,
  opts: MediaToolOptions,
  cwd: string = process.cwd()
): MediaToolCall {
  const args: Record<string, unknown> = { provider, model };
  // The tools resolve output_file against the workspace, which is the cwd.
  if (opts.output) args.output_file = relative(cwd, resolve(cwd, opts.output));
  if (kind === "speech") {
    args.text = prompt;
    if (opts.voice) args.voice = opts.voice;
    const speed = numberOption(opts.speed, "--speed");
    if (speed !== undefined) args.speed = speed;
    if (opts.instructions) args.instructions = opts.instructions;
    return { tool: "generate_speech", args };
  }
  args.prompt = prompt;
  if (opts.aspectRatio) args.aspect_ratio = opts.aspectRatio;
  if (opts.negativePrompt) args.negative_prompt = opts.negativePrompt;
  if (opts.resolution) args.resolution = opts.resolution;
  const duration = numberOption(opts.duration, "--duration");
  if (duration !== undefined) args.duration_seconds = duration;
  return { tool: "generate_video", args };
}

/** Run the tool through the installed cli-chat feature, exactly as `nodetool tools call` does. */
export async function runMediaToolCall(call: MediaToolCall): Promise<void> {
  const { loadInstalledCommandFeature } = await import("@nodetool-ai/pack-manager");
  const feature = await loadInstalledCommandFeature(import.meta.url, "cli-chat");
  await feature.run(["tools", "call", call.tool, "--args", JSON.stringify(call.args)]);
}
