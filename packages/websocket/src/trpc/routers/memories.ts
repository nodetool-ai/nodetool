/**
 * Memories router — read/search/delete the durable memories an agent records
 * via the `memory_*` tools, so the web UI can show a "what was worked on"
 * sidebar. `search` is a keyword match, the same one the agent's
 * `memory_search` runs.
 *
 * Memories are user-scoped: `list` spans every conversation and `thread_id`
 * narrows it to one. Stored resource refs are returned verbatim (asset refs
 * already carry the `asset://` uri and label captured when the memory was
 * written), avoiding an N+1 asset lookup on the hot read path.
 */

import { Memory } from "@nodetool-ai/models";
import type {
  Memory as MemoryModel,
  MemoryResource
} from "@nodetool-ai/models";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import {
  listInput,
  listOutput,
  searchInput,
  searchOutput,
  deleteInput,
  deleteOutput,
  type MemoryResponse
} from "@nodetool-ai/protocol/api-schemas/memories.js";

function toResponse(memory: MemoryModel): MemoryResponse {
  const resources: MemoryResource[] = Array.isArray(memory.resources)
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

export const memoriesRouter = router({
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .query(async ({ ctx, input }) => {
      const rows = await Memory.list(ctx.userId, {
        threadId: input.thread_id,
        limit: input.limit
      });
      return { memories: rows.map(toResponse) };
    }),

  search: protectedProcedure
    .input(searchInput)
    .output(searchOutput)
    .query(async ({ ctx, input }) => {
      const rows = await Memory.search(ctx.userId, input.query, {
        threadId: input.thread_id,
        limit: input.limit
      });
      return { memories: rows.map(toResponse) };
    }),

  delete: protectedProcedure
    .input(deleteInput)
    .output(deleteOutput)
    .mutation(async ({ ctx, input }) => {
      const memory = await Memory.find(ctx.userId, input.id);
      if (!memory) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Memory not found");
      }
      await memory.delete();
      return { ok: true as const };
    })
});
