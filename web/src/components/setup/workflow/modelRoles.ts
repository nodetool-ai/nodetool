/**
 * What each model role a plan step can need maps to.
 *
 * One table so the review step's amber marker and the setup step's tile rows
 * answer the same question the same way: which provider capability unblocks
 * this role, and what the row is called.
 */

import type { OnboardingCapability } from "../../../stores/ProviderOnboardingStore";

/** The provider capability that unblocks a role, for provider onboarding. */
export const MODEL_ROLE_ONBOARDING: Readonly<
  Record<string, OnboardingCapability>
> = {
  language: "generate_message",
  image: "text_to_image",
  video: "text_to_video",
  audio: "text_to_speech"
};

/** What the role's tile row is called on the setup step. */
export const MODEL_ROLE_LABEL: Readonly<Record<string, string>> = {
  language: "Language model",
  image: "Image model",
  video: "Video model",
  audio: "Voice model"
};
