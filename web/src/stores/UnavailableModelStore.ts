/**
 * Models a provider refused to serve to this user's key.
 *
 * A provider's model listing is not a promise. Gemini lists `gemini-2.5-pro`
 * to keys that get 404 for it, and a model offered from a static catalog can
 * be retired upstream. One user retried the same 404 fourteen times because
 * every picker kept offering it. A `not_found` provider failure lands here,
 * and the model pickers leave these models out until the entry expires or the
 * user saves or removes a key.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** A refusal is about the key, and keys change: forget it after a week. */
export const UNAVAILABLE_MODEL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** `provider/model`, the key both the failure and the model list carry. */
export const unavailableModelKey = (provider: string, model: string): string =>
  `${provider.toLowerCase()}/${model}`;

interface UnavailableModelState {
  /** Model key to the time the provider refused it. */
  refusedAt: Record<string, number>;
  markUnavailable: (provider: string, model: string, now?: number) => void;
  /**
   * Forget every refusal. A saved or removed key can change what any provider
   * serves, and the next refusal costs one failed call to learn again.
   */
  clear: () => void;
}

export const useUnavailableModelStore = create<UnavailableModelState>()(
  persist(
    (set) => ({
      refusedAt: {},
      markUnavailable: (provider, model, now = Date.now()) =>
        set((state) => ({
          refusedAt: {
            ...pruneExpired(state.refusedAt, now),
            [unavailableModelKey(provider, model)]: now
          }
        })),
      clear: () => set({ refusedAt: {} })
    }),
    { name: "unavailable-models", version: 1 }
  )
);

function pruneExpired(
  refusedAt: Record<string, number>,
  now: number
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(refusedAt).filter(
      ([, at]) => now - at < UNAVAILABLE_MODEL_TTL_MS
    )
  );
}

/** Whether a model is currently known to be refused for this user. */
export function isModelUnavailable(
  refusedAt: Record<string, number>,
  provider: string | null | undefined,
  model: string | null | undefined,
  now = Date.now()
): boolean {
  if (!provider || !model) return false;
  const at = refusedAt[unavailableModelKey(provider, model)];
  return at !== undefined && now - at < UNAVAILABLE_MODEL_TTL_MS;
}

/**
 * Drop refused models from a model list. Items without a string `provider`
 * and `id` pass through, so any picker's list can go through here.
 */
export function withoutUnavailableModels<T>(
  models: T[],
  refusedAt: Record<string, number>,
  now = Date.now()
): T[] {
  if (Object.keys(refusedAt).length === 0) return models;
  return models.filter((model) => {
    const candidate = model as { provider?: unknown; id?: unknown };
    return !(
      typeof candidate.provider === "string" &&
      typeof candidate.id === "string" &&
      isModelUnavailable(refusedAt, candidate.provider, candidate.id, now)
    );
  });
}

/** Record from outside React: the websocket manager is not a component. */
export const markModelUnavailable = (provider: string, model: string): void => {
  useUnavailableModelStore.getState().markUnavailable(provider, model);
};
