/**
 * The voices the voices step offers (PRD § 9.3).
 *
 * Studio shows `STUDIO_VOICES` — one curated model per voice, on the managed
 * `nodetool` provider, so a beginner never picks a provider. The workspace
 * shows what the configured providers actually expose, flattened to one item
 * per (model, voice), ready for the step's model and voice dropdowns.
 */

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { trpc } from "../../../lib/trpc";
import type { TTSModel } from "../../../stores/ApiTypes";
import { useInStudio } from "../../../studio/StudioContext";
import { STUDIO_VOICES } from "../../../studio/curatedModels";

/** One voice option in a speaker's model and voice controls. */
export interface SetupVoice {
  /** Unique per option: the same voice id can exist on two models. */
  id: string;
  label: string;
  modelLabel: string;
  provider: string;
  model: string;
  voice: string;
}

export interface SetupVoicesResult {
  voices: SetupVoice[];
  loading: boolean;
  /** Why the lookup failed, when it did. */
  error: string | null;
  /** Run the lookup again. */
  retry: () => void;
  /**
   * True when the lookup succeeded and no provider offers a voice — nothing to
   * wait for and nothing to retry, only a provider to connect.
   */
  noProvider: boolean;
}

export function useSetupVoices(): SetupVoicesResult {
  const inStudio = useInStudio();
  const {
    data: models,
    isLoading,
    isError,
    error,
    refetch
  } = useQuery({
    queryKey: ["tts-models"],
    queryFn: () => trpc.models.tts.query() as Promise<TTSModel[]>,
    enabled: !inStudio
  });

  const voices = useMemo<SetupVoice[]>(() => {
    if (inStudio) {
      return STUDIO_VOICES.map((option) => ({
        id: `${option.modelId}:${option.id}`,
        label: option.label,
        modelLabel: option.value.name || option.modelId,
        provider: option.value.provider ?? "",
        model: option.modelId,
        voice: option.id
      }));
    }
    return (models ?? []).flatMap((model) =>
      (model.voices ?? []).map((voice) => ({
        id: `${model.provider}:${model.id}:${voice}`,
        label: voice,
        modelLabel: model.name || model.id,
        provider: String(model.provider),
        model: model.id,
        voice
      }))
    );
  }, [inStudio, models]);

  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    voices,
    loading: !inStudio && isLoading,
    error:
      !inStudio && isError
        ? error instanceof Error
          ? error.message
          : "The voice list could not be loaded."
        : null,
    retry,
    noProvider: !inStudio && !isLoading && !isError && voices.length === 0
  };
}

export default useSetupVoices;
