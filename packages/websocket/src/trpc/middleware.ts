import { TRPCError } from "@trpc/server";
import * as sync from "@nodetool-ai/protocol/api-schemas/sync.js";
import { ApiErrorCode } from "../error-codes.js";
import { publicProcedure } from "./index.js";
import { throwApiError } from "./error-formatter.js";

export const protectedProcedure = publicProcedure.use(
  ({ ctx, type, next }) => {
    if (!ctx.userId) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required"
      });
    }
    // A client that names a protocol version below the minimum may still
    // list and read. Its writes would follow rules it does not know.
    const protocol = ctx.clientProtocol ?? null;
    if (
      type === "mutation" &&
      protocol !== null &&
      protocol < sync.MIN_CLIENT_PROTOCOL_VERSION
    ) {
      throwApiError(
        ApiErrorCode.CLIENT_TOO_OLD,
        "This app is too old to save to this server. Update it to keep editing."
      );
    }
    return next({ ctx: { ...ctx, userId: ctx.userId } });
  }
);
