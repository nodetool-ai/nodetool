/**
 * Messages router — migrated from REST `/api/messages*`.
 *
 * User ownership is enforced in every procedure — a message whose `user_id`
 * doesn't match `ctx.userId` is indistinguishable from a missing one (both
 * throw NOT_FOUND) to avoid leaking existence.
 */

import { Message } from "@nodetool-ai/models";
import type { Message as MessageModel } from "@nodetool-ai/models";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import { resolveContentUrls } from "../../resolve-media-urls.js";
import {
  listInput,
  listOutput,
  type MessageResponse
} from "@nodetool-ai/protocol/api-schemas/messages.js";

async function toMessageResponse(
  msg: MessageModel
): Promise<MessageResponse> {
  return {
    type: "message" as const,
    id: msg.id,
    user_id: msg.user_id,
    thread_id: msg.thread_id,
    role: msg.role,
    name: msg.name ?? null,
    content: await resolveContentUrls(
      msg.content as string | unknown[] | Record<string, unknown> | null,
      msg.user_id
    ),
    tool_calls: msg.tool_calls,
    tool_call_id: msg.tool_call_id ?? null,
    provider: msg.provider ?? null,
    model: msg.model ?? null,
    cost: msg.cost ?? null,
    workflow_id: msg.workflow_id ?? null,
    agent_execution_id: msg.agent_execution_id ?? null,
    execution_event_type: msg.execution_event_type ?? null,
    workflow_target: msg.workflow_target ?? null,
    media_generation: msg.media_generation ?? null,
    created_at: msg.created_at,
    // A message is never edited, and `nodetool_messages` has carried no
    // `updated_at` column since it was created, so the response reports the
    // creation time as the last-modified time.
    updated_at: msg.created_at
  };
}

export const messagesRouter = router({
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .query(async ({ ctx, input }) => {
      const [msgs, cursor] = await Message.paginate(input.thread_id, {
        limit: input.limit,
        startKey: input.cursor,
        reverse: input.reverse
      });
      // Verify user ownership — legacy handler short-circuits on the first
      // mismatch and returns 404. Mirror that exactly.
      for (const msg of msgs) {
        if (msg.user_id !== ctx.userId) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Message not found");
        }
      }
      return {
        messages: await Promise.all(msgs.map((m) => toMessageResponse(m))),
        next: cursor || null
      };
    })
});
