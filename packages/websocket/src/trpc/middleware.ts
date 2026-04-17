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
