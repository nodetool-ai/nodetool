import { TRPCError } from "@trpc/server";
import { publicProcedure } from "./index.js";

export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required"
    });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});

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
