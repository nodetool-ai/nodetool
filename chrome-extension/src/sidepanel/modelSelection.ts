/**
 * The rule that decides whether the panel may send.
 *
 * Nothing is selected by default, and a model restored from
 * `chrome.storage.local` may name a provider the current server does not
 * offer. Both cases must block the send rather than fail at the socket, so the
 * rule lives here, next to a test, instead of inline in the component.
 */

export interface ModelIdentity {
  id: string;
  name?: string;
  provider: string;
}

/** Stable identity of a model across the picker, storage and the model list. */
export function modelKey(model: ModelIdentity): string {
  return `${model.provider}::${model.id}`;
}

/** Whether `model` is one the server currently offers. */
export function isModelAvailable(
  model: ModelIdentity | null,
  models: readonly ModelIdentity[] | undefined,
): boolean {
  if (!model || !models) return false;
  const key = modelKey(model);
  return models.some((candidate) => modelKey(candidate) === key);
}

/**
 * Why sending is blocked, or null when it is allowed.
 *
 * While the model list is loading there is no reason yet: the restored model
 * is probably fine, and flashing a warning at every panel open would be noise.
 */
export function sendBlockedReason(
  model: ModelIdentity | null,
  models: readonly ModelIdentity[] | undefined,
  loading: boolean,
): string | null {
  if (loading) return null;
  if (!model) return "Choose a model to send.";
  if (!isModelAvailable(model, models)) {
    return `${model.name || model.id} is not available on this server. Choose another model.`;
  }
  return null;
}
