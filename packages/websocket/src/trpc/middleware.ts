import { TRPCError } from "@trpc/server";
import * as sync from "@nodetool-ai/protocol/api-schemas/sync.js";
import { ApiErrorCode } from "../error-codes.js";
import { isInteractiveAuthKind } from "../auth-kind.js";
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
 * a linked account, or another session. Only an interactive sign-in may call
 * it (see `auth-kind.ts`). A credential created from another one, such as a
 * personal access token, a native device session or a delegated bridge
 * token, may not, so no credential can mint a longer-lived one than itself
 * (technical design, "Sign-in protocol", access token contract).
 */
export const interactiveProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isInteractiveAuthKind(ctx.authKind)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Sign in to the web app to do this."
    });
  }
  return next();
});
