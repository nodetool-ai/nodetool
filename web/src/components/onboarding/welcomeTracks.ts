/**
 * Starter tracks for first-run onboarding. Each track maps a creative
 * modality to a chat tab: picking one opens a new conversation in that
 * modality's composer mode with the example prompt already typed, so the
 * user's first action is pressing send.
 */
import type { OnboardingCapability } from "../../stores/ProviderOnboardingStore";
import type { MediaMode } from "../../stores/MediaGenerationStore";

export type WelcomeTrackId = "image" | "video" | "audio" | "agent";

export interface WelcomeTrack {
  id: WelcomeTrackId;
  /** Card title. */
  label: string;
  /** One-line description under the title. */
  blurb: string;
  /** Short mode label shown as a mono chip on the card. */
  modeLabel: string;
  /** Modality accent color used for the card icon tint. */
  accent: string;
  /** Title given to the chat tab this track opens. */
  threadTitle: string;
  /** Example prompt pre-filled into the composer. */
  samplePrompt: string;
  /** Composer mode the chat opens in. */
  chatMode: MediaMode;
  /**
   * What a provider must be able to do for this track's first send to work.
   * Narrows provider onboarding to the ones that unblock the track the user
   * just picked.
   */
  capability: OnboardingCapability;
}

export const WELCOME_TRACKS: WelcomeTrack[] = [
  {
    id: "agent",
    label: "Agent",
    blurb: "A task the agent plans, runs, and reports back on.",
    modeLabel: "agent",
    accent: "#60A5FA",
    threadTitle: "Agent",
    samplePrompt:
      "research the three strongest open-source video models and write a short comparison I can paste into a doc",
    chatMode: "chat",
    capability: "generate_message"
  },
  {
    id: "image",
    label: "Image",
    blurb: "A still frame from a prompt.",
    modeLabel: "image",
    accent: "#9F7AEA",
    threadTitle: "Image",
    samplePrompt:
      "a brutalist concrete pavilion at dusk, fog rolling in low, single warm light from inside, photograph, medium format",
    chatMode: "image",
    capability: "text_to_image"
  },
  {
    id: "video",
    label: "Video",
    blurb: "A short clip from a prompt.",
    modeLabel: "video",
    accent: "#F472B6",
    threadTitle: "Video",
    samplePrompt:
      "slow dolly through an empty library at golden hour, dust in the air, 24fps, cinematic",
    chatMode: "video",
    capability: "text_to_video"
  },
  {
    id: "audio",
    label: "Audio",
    blurb: "A spoken line or sound texture.",
    modeLabel: "audio",
    accent: "#FBBF24",
    threadTitle: "Audio",
    samplePrompt:
      "a calm narrator: you are listening to nodetool. every model, your keys, your canvas.",
    chatMode: "audio",
    capability: "text_to_speech"
  }
];
