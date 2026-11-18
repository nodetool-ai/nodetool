/**
 * tRPC router for transfers into cloud projects (WP2.4). The bytes of a
 * file are staged over REST, `PUT /api/transfers/:id/files/:hash`.
 */
import { ApiErrorCode } from "@nodetool-ai/protocol/api-schemas/api-error-code.js";
import {
  cancelTransferOutput,
  commitTransferInput,
  openTransferInput,
  openTransferOutput,
  transferAttemptResult,
  transferIdInput,
  transferStatusOutput
} from "@nodetool-ai/protocol/api-schemas/transfer.js";
import {
  cancelTransfer,
  commitTransfer,
  openTransfer,
  TransferRequestError,
  transferStatus
} from "@nodetool-ai/project-services/cloud-transfer";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import { transferHost } from "../../lib/transfer-host.js";

const API_CODE_BY_TRANSFER_CODE: Record<TransferRequestError["code"], ApiErrorCode> = {
  NOT_FOUND: ApiErrorCode.NOT_FOUND,
  CONFLICT: ApiErrorCode.ALREADY_EXISTS,
  INVALID: ApiErrorCode.INVALID_INPUT,
  ATTEMPT_CONTENT_MISMATCH: ApiErrorCode.ATTEMPT_CONTENT_MISMATCH,
  NEEDS_POSTGRES: ApiErrorCode.SERVICE_UNAVAILABLE
};

/** Runs `body`, rethrowing a {@link TransferRequestError} as its API refusal. */
export async function withTransferRefusal<T>(body: () => Promise<T>): Promise<T> {
  try {
    return await body();
  } catch (error) {
    if (error instanceof TransferRequestError) {
      throwApiError(API_CODE_BY_TRANSFER_CODE[error.code], error.message);
    }
    throw error;
  }
}

export const transfersRouter = router({
  open: protectedProcedure
    .input(openTransferInput)
    .output(openTransferOutput)
    .mutation(({ ctx, input }) => withTransferRefusal(() => openTransfer(transferHost(), ctx.userId, input))),

  commit: protectedProcedure
    .input(commitTransferInput)
    .output(transferAttemptResult)
    .mutation(({ ctx, input }) => withTransferRefusal(() => commitTransfer(transferHost(), ctx.userId, input))),

  status: protectedProcedure
    .input(transferIdInput)
    .output(transferStatusOutput)
    .query(({ ctx, input }) => withTransferRefusal(() => transferStatus(ctx.userId, input.transfer_id))),

  cancel: protectedProcedure
    .input(transferIdInput)
    .output(cancelTransferOutput)
    .mutation(({ ctx, input }) => withTransferRefusal(() => cancelTransfer(ctx.userId, input.transfer_id)))
});
