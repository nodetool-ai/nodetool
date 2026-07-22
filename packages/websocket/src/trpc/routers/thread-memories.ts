/**
 * Thread-memories router — read/delete the durable per-conversation memories
 * an agent records via the `thread_memory_*` tools, so the web UI can show a
 * "what was worked on" sidebar for the open thread.
 *
 * `list` is thread-scoped and backed by the `(thread_id, created_at)`
 * composite index, so it resolves as a single indexed range scan. Stored
 * resource refs are returned verbatim (asset refs already carry the
 * `asset://` uri and label captured when the memory was written), avoiding an
 * N+1 asset lookup on the hot read path.
 */

import { ThreadMemory } from "@nodetool-ai/models";
import type {
  ThreadMemory as ThreadMemoryModel,
  ThreadMemoryResource
} from "@nodetool-ai/models";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import {
  listInput,
  listOutput,
  deleteInput,
  deleteOutput,
  type ThreadMemoryResponse
} from "@nodetool-ai/protocol/api-schemas/thread-memories.js";

function toResponse(memory: ThreadMemoryModel): ThreadMemoryResponse {
  const resources: ThreadMemoryResource[] = Array.isArray(memory.resources)
    ? memory.resources
    : [];
  return {
    id: memory.id,
    thread_id: memory.thread_id,
    kind: memory.kind,
    title: memory.title,
    content: memory.content,
    resources,
    created_at: memory.created_at,
    updated_at: memory.updated_at
  };
}

export const threadMemoriesRouter = router({
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .query(async ({ ctx, input }) => {
      const memories = await ThreadMemory.listByThread(
        ctx.userId,
        input.thread_id,
        input.limit
      );
      return { memories: memories.map(toResponse) };
    }),

  delete: protectedProcedure
    .input(deleteInput)
    .output(deleteOutput)
    .mutation(async ({ ctx, input }) => {
      const memory = await ThreadMemory.find(ctx.userId, input.id);
      if (!memory) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Thread memory not found");
      }
      await memory.delete();
      return { ok: true as const };
    })
});
