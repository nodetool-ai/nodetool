import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context.js";
import { errorFormatter } from "./error-formatter.js";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter
});

export const router = t.router;
export const mergeRouters = t.mergeRouters;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;
export { TRPCError };
