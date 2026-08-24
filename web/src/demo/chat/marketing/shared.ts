/**
 * Shared pieces of the marketing chat casts — the model badge, the asset base,
 * and the clock the tool-call durations are measured against.
 *
 * All four casts tell one story: the agent takes "SCRAPHEART", a six-shot
 * desert-chase teaser, from a question to a cut timeline. They are authored,
 * not recorded, for the same reason `../agentChatCast.ts` is: a screenshot
 * that must regenerate byte-identical cannot depend on a model's mood or on
 * spending render credits.
 */
import { PROVIDER_IDS, type LanguageModel } from "../../../stores/ApiTypes";

export const MARKETING_CHAT_MODEL: LanguageModel = {
  type: "language_model",
  id: "claude-sonnet-5",
  name: "Claude Sonnet 5",
  provider: PROVIDER_IDS.ANTHROPIC,
};

/** Stills and the contact sheet live in `web/public/demo-assets/chat-marketing`. */
export const ASSETS = "/demo-assets/chat-marketing";

/** Wall-clock anchor. Only differences matter — the cards show durations. */
const EPOCH = Date.parse("2026-08-24T10:00:00.000Z");

/** An ISO timestamp `ms` after the cast's anchor. */
export const at = (ms: number): string => new Date(EPOCH + ms).toISOString();
