/**
 * modeProviderSetup — maps a composer media mode to the provider capability it
 * needs, plus the message shown when no provider with that capability is
 * configured. Used by the composer's setup banner and its send gate to route
 * the user into the provider-onboarding dialog instead of letting a send fail.
 */
import type { MediaMode } from "../../../stores/MediaGenerationStore";
import type { OnboardingCapability } from "../../../stores/ProviderOnboardingStore";

/** Backend capability a mode's generation request is served by. Modes that are
 *  not selectable yet (retake, extend, …) map to null and are never gated. */
export const capabilityForMode = (
  mode: MediaMode
): OnboardingCapability | null => {
  switch (mode) {
    case "chat":
      return "generate_message";
    case "image":
    case "image_edit":
      return "text_to_image";
    case "video":
    case "image_to_video":
      return "text_to_video";
    case "audio":
      return "text_to_speech";
    default:
      return null;
  }
};

/** One-liner shown in the setup banner and passed to the onboarding dialog. */
export const setupReasonForMode = (mode: MediaMode): string | null => {
  switch (mode) {
    case "chat":
      return "Chat needs a language model. Connect a provider to start.";
    case "image":
      return "Generating images needs an image provider. Connect one to continue.";
    case "image_edit":
      return "Editing images needs an image provider. Connect one to continue.";
    case "video":
      return "Generating videos needs a video provider. Connect one to continue.";
    case "image_to_video":
      return "Animating images needs a video provider. Connect one to continue.";
    case "audio":
      return "Generating speech needs a text-to-speech provider. Connect one to continue.";
    default:
      return null;
  }
};
