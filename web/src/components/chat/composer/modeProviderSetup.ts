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
    case "reference_to_video":
    case "retake":
    case "extend":
      return "text_to_video";
    case "audio_to_video":
      return "lip_sync";
    case "music":
      return "text_to_music";
    case "audio":
      return "text_to_speech";
    default:
      return null;
  }
};

/** Modes whose setup banner has copy, keyed as the catalog keys them. */
const SETUP_REASON_MODES: ReadonlySet<MediaMode> = new Set<MediaMode>([
  "chat",
  "image",
  "image_edit",
  "video",
  "image_to_video",
  "reference_to_video",
  "retake",
  "extend",
  "audio_to_video",
  "music",
  "audio"
]);

/**
 * Catalog key of the one-liner shown in the setup banner and passed to the
 * onboarding dialog, or null for a mode that is never gated.
 */
export const setupReasonKeyForMode = (mode: MediaMode): string | null =>
  SETUP_REASON_MODES.has(mode) ? `i18n-next33.providerSetup.${mode}` : null;
