import { isNonEmptyString, isRecord } from "../utils/type-guards.js";

export interface ModelArgs {
  provider: string;
  model: string;
}

/**
 * Read a provider+model from the shapes find_model and
 * `nodetool.models.find/pick` return: a hit (`provider` + `model_id` + `ref`),
 * its `.ref` (`type` + `provider` + `id`), or a `{provider, model}` pair.
 * Nested `ref` objects win over the top-level pair so `model: hit` and
 * `model: hit.ref` resolve the same model.
 */
export function modelFromRecord(value: unknown): ModelArgs | null {
  if (!isRecord(value)) return null;
  if (isRecord(value.ref)) {
    const fromRef = modelFromRecord(value.ref);
    if (fromRef !== null) return fromRef;
  }
  const provider = isNonEmptyString(value.provider) ? value.provider : undefined;
  const id = [value.model_id, value.model, value.id].find(isNonEmptyString);
  if (provider !== undefined && id !== undefined) {
    return { provider, model: id };
  }
  return null;
}
