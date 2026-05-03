/**
 * Threads router — migrated from REST `/api/threads*`.
 *
 * Handlers previously lived inline in http-api.ts (`handleThreadsRoot`,
 * `handleThreadById`, `handleThreadSummarize`). The delete path cascades
 * to Message.delete() in batches of 100, mirroring the legacy behavior.
 */

import { Thread, Message } from "@nodetool-ai/models";
import type { Thread as ThreadModel } from "@nodetool-ai/models";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import {
  listInput,
  listOutput,
  getInput,
  threadResponse,
  createInput,
  updateInput,
  deleteInput,
  deleteOutput,
  summarizeInput,
  summarizeOutput,
  type ThreadResponse
} from "@nodetool-ai/protocol/api-schemas/threads.js";

/** Maximum length of a derived thread title before truncation. */
const THREAD_TITLE_MAX_LEN = 60;
/** Length of visible text when a title is truncated (max - "...".length). */
const THREAD_TITLE_TRUNC_LEN = THREAD_TITLE_MAX_LEN - 3;

function toThreadResponse(thread: ThreadModel): ThreadResponse {
  return {
    id: thread.id,
    user_id: thread.user_id,
    title: thread.title,
    created_at: thread.created_at,
    updated_at: thread.updated_at,
    etag: thread.getEtag()
  };
}

/**
 * Derive a short title from a thread's messages. Port of the legacy
 * `deriveThreadTitle` — scans up to 10 messages, pulls the first non-empty
 * user-visible text, truncates to THREAD_TITLE_MAX_LEN with "..." suffix,
 * falls back to "New Thread".
 */
async function deriveThreadTitle(threadId: string): Promise<string> {
  const [messages] = await Message.paginate(threadId, { limit: 10 });
  for (const msg of messages) {
    const content = msg.content;
    if (typeof content === "string" && content.trim().length > 0) {
      const text = content.trim().replace(/\s+/g, " ");
      return text.length > THREAD_TITLE_MAX_LEN
        ? text.slice(0, THREAD_TITLE_TRUNC_LEN) + "..."
        : text;
    }
    if (Array.isArray(content)) {
      for (const part of content) {
        if (
          part !== null &&
          typeof part === "object" &&
          "type" in part &&
          (part as Record<string, unknown>).type === "text" &&
          "text" in part &&
          typeof (part as Record<string, unknown>).text === "string"
        ) {
          const text = ((part as Record<string, unknown>).text as string)
            .trim()
            .replace(/\s+/g, " ");
          if (text.length > 0) {
            return text.length > THREAD_TITLE_MAX_LEN
              ? text.slice(0, THREAD_TITLE_TRUNC_LEN) + "..."
              : text;
          }
        }
      }
    }
  }
  return "New Thread";
}

export const threadsRouter = router({
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .query(async ({ ctx, input }) => {
      const [threads, cursor] = await Thread.paginate(ctx.userId, {
        limit: input.limit,
        startKey: input.cursor,
        reverse: input.reverse
      });
      return {
        threads: threads.map((t) => toThreadResponse(t)),
        next: cursor || null
      };
    }),

  get: protectedProcedure
    .input(getInput)
    .output(threadResponse)
    .query(async ({ ctx, input }) => {
      const thread = await Thread.find(ctx.userId, input.id);
      if (!thread) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Thread not found");
      }
      return toThreadResponse(thread);
    }),

  create: protectedProcedure
    .input(createInput)
    .output(threadResponse)
    .mutation(async ({ ctx, input }) => {
      const title = input.title ?? "New Thread";
      const thread = (await Thread.create({
        user_id: ctx.userId,
        title
      })) as unknown as ThreadModel;
      return toThreadResponse(thread);
    }),

  update: protectedProcedure
    .input(updateInput)
    .output(threadResponse)
    .mutation(async ({ ctx, input }) => {
      const thread = await Thread.find(ctx.userId, input.id);
      if (!thread) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Thread not found");
      }
      thread.title = input.title;
      await thread.save();
      return toThreadResponse(thread);
    }),

  delete: protectedProcedure
    .input(deleteInput)
    .output(deleteOutput)
    .mutation(async ({ ctx, input }) => {
      const thread = await Thread.find(ctx.userId, input.id);
      if (!thread) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Thread not found");
      }
      // Delete all messages in the thread, batched.
      while (true) {
        const [msgs] = await Message.paginate(input.id, { limit: 100 });
        if (!msgs.length) break;
        for (const msg of msgs) {
          await msg.delete();
        }
        if (msgs.length < 100) break;
      }
      await thread.delete();
      return { ok: true as const };
    }),

  summarize: protectedProcedure
    .input(summarizeInput)
    .output(summarizeOutput)
    .mutation(async ({ ctx, input }) => {
      const thread = await Thread.find(ctx.userId, input.id);
      if (!thread) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Thread not found");
      }
      const title = await deriveThreadTitle(input.id);
      thread.title = title;
      await thread.save();
      return { title };
    })
});
