import {
  getInput,
  listOutput,
  realtimeSessionRecord
} from "@nodetool/protocol/api-schemas/realtime.js";
import { ApiErrorCode } from "../../error-codes.js";
import { realtimeSessionManager } from "../../realtime/session-manager.js";
import { throwApiError } from "../error-formatter.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";

export const realtimeRouter = router({
  list: protectedProcedure.output(listOutput).query(({ ctx }) => ({
    sessions: realtimeSessionManager.listSessions(ctx.userId)
  })),

  get: protectedProcedure
    .input(getInput)
    .output(realtimeSessionRecord)
    .query(({ ctx, input }) => {
      const session = realtimeSessionManager.getSession(input.id, ctx.userId);
      if (!session) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Realtime session not found");
      }
      return session;
    })
});
