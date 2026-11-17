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
    // A client below the minimum protocol may still list and read. Its
    // writes would follow rules it does not know. A native app always names
    // its version, so a native session without one is refused as too old.
    // Any other caller without the header is a legacy client: its writes
    // are accepted and read as the legacy schema (see sync.ts).
    const protocol = ctx.clientProtocol ?? null;
    if (
      type === "mutation" &&
      ((protocol === null && Boolean(ctx.nativeSessionId)) ||
        (protocol !== null && protocol < sync.MIN_CLIENT_PROTOCOL_VERSION))
    ) {
      throwApiError(
        ApiErrorCode.CLIENT_TOO_OLD,
        "This app is too old to save to this server. Update it to keep editing."
      );
    }
    return next({ ctx: { ...ctx, userId: ctx.userId } });
  }
);

/**
 * A procedure that creates a credential: an access token, an OAuth consent,
 * or another session. A native device session may not call it, so a stolen
 * `ntd_` token cannot mint a longer-lived credential than itself
 * (technical design, "Sign-in protocol", access token contract).
 */
export const interactiveProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.nativeSessionId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Sign in to the web app to do this."
    });
  }
  return next();
});
