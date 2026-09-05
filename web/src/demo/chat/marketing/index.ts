/**
 * Chat casts authored for the marketing site. One story across four frames:
 * a question, the work, the bill, and the delivered teaser.
 */
import { capabilityMapCast } from "./capabilityMapCast";
import { costPreviewCast } from "./costPreviewCast";
import { deliveredCast } from "./deliveredCast";
import { storyboardCast } from "./storyboardCast";
import type { ChatDemoCast } from "../chatCastTypes";

export const marketingChatCasts: ChatDemoCast[] = [
  capabilityMapCast,
  storyboardCast,
  costPreviewCast,
  deliveredCast,
];
