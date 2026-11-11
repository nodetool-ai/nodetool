/**
 * Teaches the chat thread to render a chat app's turns: a show-step call as
 * its card, an app event as its chip. Imported by the chat app view.
 */
import { parseChatAppEvent } from "@nodetool-ai/app-runtime";

import {
  registerInlineToolWidget,
  registerUserTurnRenderer
} from "../../chat/message/messageExtensions";
import ChatAppEventChip from "./ChatAppEventChip";
import ChatAppStepCard, { SHOW_STEP_TOOL } from "./ChatAppStepCard";

registerInlineToolWidget(SHOW_STEP_TOOL, ChatAppStepCard);
registerUserTurnRenderer((text) =>
  parseChatAppEvent(text) ? ChatAppEventChip : null
);
