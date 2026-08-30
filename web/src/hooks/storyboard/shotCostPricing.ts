/**
 * Pricing one storyboard render step, apart from React.
 *
 * The still and the clip are priced by different models at different rungs,
 * and only the clip's figure moves with a shot's length. Both the per-shot
 * inspector line and the toolbar's batch estimate ask the same question of the
 * same catalog, so the question lives here rather than inside either hook.
 */

import { getModelUnitPrice } from "../../utils/modelUnitPricing";

/** One render step a shot pays for. */
export interface ShotCostStep {
  /** "Still" or "Clip". */
  label: string;
  /** The step's cost in USD, or null when nothing prices it. */
  cost: number | null;
  /** How the figure was reached: "4 s × $0.1/s at 1080p". */
  breakdown?: string;
  /** Why there is no figure, when there is none. */
  reason?: string;
}

/** A model selection as the pricing catalog takes it. */
export interface BoardModel {
  id: string;
  provider: string | null;
  name?: string;
}

/** A price billed in "units" or "credits" has no fixed currency value. */
const isVagueBillingUnit = (unit: string | undefined): boolean =>
  !!unit && /\bunits?\b|\bcredits?\b/i.test(unit.trim());

/** A price that can be shown as money, or null. */
function usable(
  price: ReturnType<typeof getModelUnitPrice>
): NonNullable<ReturnType<typeof getModelUnitPrice>> | null {
  if (
    !price ||
    price.declined ||
    !Number.isFinite(price.unit_price) ||
    isVagueBillingUnit(price.billing_unit)
  ) {
    return null;
  }
  return price;
}

/**
 * One step's price, or the reason there is none.
 *
 * The rung the render sends is asked for first. A model that publishes no such
 * rung declines it, and the answer then is the model's base spec plus a note —
 * dropping the step would hide the clip's cost on every model whose ladder
 * stops below 1080p.
 */
export function priceRenderStep(
  label: string,
  model: BoardModel | null,
  pickerLabel: string,
  resolution: string,
  seconds: number | undefined,
  notes: string[]
): ShotCostStep {
  if (!model?.id) {
    return {
      label,
      cost: null,
      reason: `No ${pickerLabel} picked for this board.`
    };
  }
  const selected = { id: model.id, provider: model.provider };
  const atRung = usable(getModelUnitPrice(selected, { resolution, seconds }));
  const price = atRung ?? usable(getModelUnitPrice(selected, { seconds }));
  if (!price) {
    return {
      label,
      cost: null,
      reason: `No published price for ${model.name || model.id}.`
    };
  }
  if (!atRung) {
    notes.push(
      `${label.toLowerCase()}: this model publishes no ${resolution} price — shown at its base spec`
    );
  }
  notes.push(...(price.assumptions ?? []), ...(price.warnings ?? []));
  return { label, cost: price.unit_price, breakdown: price.breakdown };
}
