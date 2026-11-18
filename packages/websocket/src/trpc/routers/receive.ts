/**
 * tRPC router for receiving from cloud projects (WP2.5). The bytes of a file
 * come over REST, `GET /api/receive/:set_id/files/:hash`.
 */
import { ApiErrorCode } from "@nodetool-ai/protocol/api-schemas/api-error-code.js";
import {
  captureRevisionSetInput,
  captureRevisionSetOutput,
  receiveDocumentInput,
  receiveDocumentOutput,
  releaseRevisionSetInput,
  releaseRevisionSetOutput
} from "@nodetool-ai/protocol/api-schemas/receive.js";
import {
  captureRevisionSet,
  receiveDocument,
  ReceiveRequestError,
  releaseRevisionSet
} from "@nodetool-ai/project-services/cloud-receive";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import { receiveHost } from "../../lib/receive-host.js";

const API_CODE_BY_RECEIVE_CODE: Record<ReceiveRequestError["code"], ApiErrorCode> = {
  NOT_FOUND: ApiErrorCode.NOT_FOUND,
  SET_EXPIRED: ApiErrorCode.REVISION_SET_EXPIRED
};

async function withReceiveRefusal<T>(body: () => Promise<T>): Promise<T> {
  try {
    return await body();
  } catch (error) {
    if (error instanceof ReceiveRequestError) {
      throwApiError(API_CODE_BY_RECEIVE_CODE[error.code], error.message);
    }
    throw error;
  }
}

export const receiveRouter = router({
  capture: protectedProcedure
    .input(captureRevisionSetInput)
    .output(captureRevisionSetOutput)
    .mutation(({ ctx, input }) => withReceiveRefusal(() => captureRevisionSet(receiveHost(), ctx.userId, input))),

  document: protectedProcedure
    .input(receiveDocumentInput)
    .output(receiveDocumentOutput)
    .query(({ ctx, input }) => withReceiveRefusal(() => receiveDocument(receiveHost(), ctx.userId, input))),

  release: protectedProcedure
    .input(releaseRevisionSetInput)
    .output(releaseRevisionSetOutput)
    .mutation(async ({ ctx, input }) => {
      await releaseRevisionSet(ctx.userId, input.set_id);
      return { released: true as const };
    })
});
