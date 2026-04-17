import { z } from "zod";
import { router, publicProcedure } from "./index.js";

export const appRouter = router({
  healthz: publicProcedure.output(z.object({ ok: z.literal(true) })).query(() => ({
    ok: true as const
  }))
});

export type AppRouter = typeof appRouter;
