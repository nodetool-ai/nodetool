/**
 * Documents router — tRPC.
 *
 * The project navigator's one read. It used to build its list from the eight
 * per-kind list endpoints, each of which answers with whole rows — graphs,
 * boards, sketch layers — to print a name; over a cloud database the panel sat
 * on a spinner until the slowest of the eight landed. This returns the three
 * columns a row draws, for every kind, in one round trip.
 *
 * Procedures:
 *   index (query) — DocumentIndex
 */

import { listDocumentIndex } from "@nodetool-ai/models";
import {
  documentIndex,
  documentIndexInput
} from "@nodetool-ai/protocol/api-schemas/documents.js";

import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";

export const documentsRouter = router({
  index: protectedProcedure
    .input(documentIndexInput)
    .output(documentIndex)
    .query(({ ctx, input }) => listDocumentIndex(ctx.userId, input.projectId))
});
