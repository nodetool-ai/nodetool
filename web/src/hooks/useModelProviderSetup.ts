import { useCallback, useEffect, useRef } from "react";
import { useProviders } from "./useProviders";
import {
  openProviderOnboarding,
  type OnboardingCapability
} from "../stores/ProviderOnboardingStore";

export const capabilityForModelType = (
  modelType?: string
): OnboardingCapability | undefined => {
  switch (modelType) {
    case "language_model": return "generate_message";
    case "image_model": return "text_to_image";
    case "video_model": return "text_to_video";
    case "tts_model": return "text_to_speech";
    case "asr_model": return "automatic_speech_recognition";
    case "music_model": return "text_to_music";
    case "audio_to_audio_model": return "audio_to_audio";
    case "embedding_model": return "generate_embedding";
    case "model_3d_model": return "text_to_3d";
    default: return undefined;
  }
};

interface ModelProviderSetupOptions {
  open: boolean;
  onClose: () => void;
  capability?: OnboardingCapability;
  /** Restrict specialized pickers to the providers they can actually use. */
  providerIds?: readonly string[];
  isLoading?: boolean;
  highlightSecretKey?: string;
}

/** Open setup once per picker opening, only after provider discovery succeeds. */
export function useModelProviderSetup({
  open,
  onClose,
  capability,
  providerIds,
  isLoading: pickerLoading = false,
  highlightSecretKey
}: ModelProviderSetupOptions): { openSetup: () => void } {
  const { providers, isLoading, isFetching, error } = useProviders();
  const prompted = useRef(false);
  const hasProvider = providers.some((provider) =>
    (!capability || provider.capabilities.includes(capability)) &&
    (!providerIds || providerIds.includes(provider.provider))
  );
  const openSetup = useCallback(() => {
    onClose();
    openProviderOnboarding({ capability, highlightSecretKey });
  }, [onClose, capability, highlightSecretKey]);

  useEffect(() => {
    if (!open) {
      prompted.current = false;
      return;
    }
    if (isLoading || isFetching || pickerLoading || error || hasProvider || prompted.current) {
      return;
    }
    prompted.current = true;
    openSetup();
  }, [open, isLoading, isFetching, pickerLoading, error, hasProvider, openSetup]);

  return { openSetup };
}
