/**
 * Every chat cast the demo page and the screenshot harness can render, by id.
 * Sibling to `../doc/casts.ts`.
 */
import { agentChatCast } from "./agentChatCast";
import { marketingChatCasts } from "./marketing";
import type { ChatDemoCast } from "./chatCastTypes";

export const chatCasts: ChatDemoCast[] = [agentChatCast, ...marketingChatCasts];
