/**
 * Whether the curated look choices can actually be rendered right now.
 *
 * PRD § 8.3 pins the tiles to the curated Studio clip models and voices, so
 * this does not replace that list with a provider browser. It asks the
 * narrower question the flow owes the creator before a paid button: does a
 * configured provider report the model behind the tile? The four answers a
 * step has to be able to tell apart are loading, failed, no provider at all,
 * and a provider that offers nothing compatible (F14).
 *
 * The curated catalog is NodeTool's own managed models, which only the cloud
 * `nodetool` provider reports. Where it is absent — desktop, self-hosted, or
 * a BYOK account — no tile is available however many video providers are
 * configured, so the hooks also hand back what those providers do report and
 * the step offers that instead of blaming the setup.
 */

import { useMemo } from "react";

import {
  useTTSModelsByProvider,
  useVideoModelsByProvider
} from "../../../hooks/useModelsByProvider";

/** A model a configured provider reports, as the fallback picker selects it. */
export interface ReportedOption {
  /** What the picker selects on: the model id, or the voice id for a voice. */
  id: string;
  /** The model behind the option — the same as {@link id} except for a voice. */
  modelId: string;
  provider: string;
  /** User-facing name, qualified by the provider that offers it. */
  label: string;
}

export interface CuratedAvailability {
  /** The provider's model list has not answered yet. */
  loading: boolean;
  /** Why the list could not be read, in the creator's words. */
  error: string | null;
  refetch: () => void;
  /**
   * The ids a configured provider reports, or null while that is unknown —
   * loading, or a failed query. Null means "do not judge a tile by this".
   */
  ids: ReadonlySet<string> | null;
  /** No configured provider offers this kind of model at all. */
  noProvider: boolean;
  /** Everything the configured providers report, for the fallback picker. */
  reported: ReportedOption[];
}

/** Whether a tile can be picked: unknown availability never disables one. */
export const isAvailable = (
  availability: CuratedAvailability,
  id: string
): boolean => availability.ids === null || availability.ids.has(id);

/** The clip models a configured provider reports for `text_to_video`. */
export function useClipModelAvailability(): CuratedAvailability {
  const { models, providers, isLoading, error, refetch } =
    useVideoModelsByProvider({ task: "text_to_video" });

  const ids = useMemo(
    () =>
      isLoading || error ? null : new Set(models.map((model) => model.id)),
    [error, isLoading, models]
  );

  const reported = useMemo(
    () =>
      isLoading || error
        ? []
        : models.map((model) => ({
            id: model.id,
            modelId: model.id,
            provider: model.provider ?? "",
            label: `${model.name || model.id} (${model.provider ?? ""})`
          })),
    [error, isLoading, models]
  );

  return {
    loading: isLoading,
    error: error ? error.message : null,
    refetch: () => void refetch(),
    ids,
    noProvider: !isLoading && !error && providers.length === 0,
    reported
  };
}

/**
 * The voices a configured provider reports. A curated voice is one model plus
 * one voice, so a voice counts as available when its model is reported and
 * names it.
 */
export function useVoiceAvailability(): CuratedAvailability {
  const { models, providers, isLoading, error, refetch } =
    useTTSModelsByProvider();

  const ids = useMemo(() => {
    if (isLoading || error) {
      return null;
    }
    const voices = new Set<string>();
    for (const model of models) {
      for (const voice of model.voices ?? []) {
        voices.add(voice);
      }
    }
    return voices;
  }, [error, isLoading, models]);

  const reported = useMemo(
    () =>
      isLoading || error
        ? []
        : models.flatMap((model) =>
            (model.voices ?? []).map((voice) => ({
              id: voice,
              modelId: model.id,
              provider: model.provider ?? "",
              label: `${voice} — ${model.name || model.id} (${model.provider ?? ""})`
            }))
          ),
    [error, isLoading, models]
  );

  return {
    loading: isLoading,
    error: error ? error.message : null,
    refetch: () => void refetch(),
    ids,
    noProvider: !isLoading && !error && providers.length === 0,
    reported
  };
}
