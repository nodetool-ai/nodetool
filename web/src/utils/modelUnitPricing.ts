/**
 * Unit price for a model chosen on a generic node's provider-model property.
 *
 * The implementation lives in `@nodetool-ai/model-pricing` so the editor's cost
 * preview and the server-side pre-run budget estimate share one lookup — the
 * price shown here is the price a run is gated on.
 */

export {
  getModelUnitPrice,
  default
} from "@nodetool-ai/model-pricing";
