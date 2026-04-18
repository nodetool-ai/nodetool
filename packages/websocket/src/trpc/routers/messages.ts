/**
 * Messages router — migrated from REST `/api/messages*`.
 *
 * Handlers previously lived inline in http-api.ts (`handleMessagesRoot`,
 * `handleMessageById`). The logic is ported verbatim here; helpers that
 * were useful only to those handlers (`toMessageResponse`, `MessageCreateBody`)
 * move with them.
 *
 * User ownership is enforced in every procedure — a message whose `user_id`
 * doesn't match `ctx.userId` is indistinguishable from a missing one (both
 * throw NOT_FOUND) to avoid leaking existence.
 */

import { Message, Thread } from "@nodetool/models";
import type { Message as MessageModel } from "@nodetool/models";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import { resolveContentUrls } from "../../resolve-media-urls.js";
import {
  listInput,
  listOutput,
  createInput,
  messageResponse,
  getInput,
  deleteInput,
  deleteOutput,
  type MessageResponse
} from "@nodetool/protocol/api-schemas/messages.js";

function toMessageResponse(msg: MessageModel): MessageResponse {
  return {
    type: "message" as const,
    id: msg.id,
    user_id: msg.user_id,
    thread_id: msg.thread_id,
    role: msg.role,
    name: msg.name ?? null,
    content: resolveContentUrls(
      msg.content as string | unknown[] | Record<string, unknown> | null
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
    updated_at: (msg as unknown as { updated_at?: string }).updated_at ??
      msg.created_at
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
        messages: msgs.map((m) => toMessageResponse(m)),
        next: cursor || null
      };
    }),

  create: protectedProcedure
    .input(createInput)
    .output(messageResponse)
    .mutation(async ({ ctx, input }) => {
      let threadId = input.thread_id;
      if (!threadId) {
        const thread = (await Thread.create({
          user_id: ctx.userId,
          title: "New Thread"
        })) as unknown as { id: string };
        threadId = thread.id;
      }
      const contentStr =
        typeof input.content === "string"
          ? input.content
          : JSON.stringify(input.content ?? null);
      const msg = (await Message.create({
        user_id: ctx.userId,
        thread_id: threadId,
        role: input.role,
        name: input.name ?? null,
        content: contentStr,
        tool_calls: input.tool_calls ?? null
      })) as MessageModel;
      return toMessageResponse(msg);
    }),

  get: protectedProcedure
    .input(getInput)
    .output(messageResponse)
    .query(async ({ ctx, input }) => {
      const msg = (await Message.get(input.id)) as MessageModel | null;
      if (!msg || msg.user_id !== ctx.userId) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Message not found");
      }
      return toMessageResponse(msg);
    }),

  delete: protectedProcedure
    .input(deleteInput)
    .output(deleteOutput)
    .mutation(async ({ ctx, input }) => {
      const msg = (await Message.get(input.id)) as MessageModel | null;
      if (!msg || msg.user_id !== ctx.userId) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Message not found");
      }
      await msg.delete();
      return { ok: true as const };
    })
});
