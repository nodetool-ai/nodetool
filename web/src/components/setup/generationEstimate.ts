import { calcPrice } from "@pydantic/genai-prices";
import {
  genaiProviderId,
  isLocalFreeProvider,
  resolveNodetoolDelegate
} from "@nodetool-ai/protocol";

export interface GenerationModel {
  id: string;
  provider: string;
  name?: string;
}

/** Planning allowance, not a quote or spending cap. Actual prompts and output vary. */
export function generationEstimate(
  model: GenerationModel | null,
  brief: string,
  maxOutputTokens: number
): { low: number; high: number; inputTokens: number } | null {
  if (!model?.id) return null;
  const delegate =
    model.provider === "nodetool" ? resolveNodetoolDelegate(model.id) : null;
  const provider = delegate?.provider ?? model.provider;
  const id = delegate?.model ?? model.id;
  const inputTokens = Math.ceil(brief.length / 4) + 3000;
  // The provider tables are shared with the server-side CostCalculator, so an
  // estimate here and the charge there cannot disagree about which provider a
  // model belongs to, or which ones are free.
  if (isLocalFreeProvider(provider)) {
    return { low: 0, high: 0, inputTokens };
  }
  try {
    const price = (output: number) =>
      calcPrice({ input_tokens: inputTokens, output_tokens: output }, id, {
        providerId: genaiProviderId(provider) ?? provider
      })?.total_price ?? null;
    const low = price(Math.min(1000, maxOutputTokens));
    const high = price(maxOutputTokens);
    return low === null || high === null ? null : { low, high, inputTokens };
  } catch {
    return null;
  }
}
