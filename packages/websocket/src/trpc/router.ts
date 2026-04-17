import { z } from "zod";
import { router, publicProcedure } from "./index.js";
import { costsRouter } from "./routers/costs.js";

export const appRouter = router({
  healthz: publicProcedure.output(z.object({ ok: z.literal(true) })).query(() => ({
    ok: true as const
  })),
  costs: costsRouter
});

export type AppRouter = typeof appRouter;
