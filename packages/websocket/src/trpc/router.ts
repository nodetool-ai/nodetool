import { z } from "zod";
import { router, publicProcedure } from "./index.js";
import { collectionsRouter } from "./routers/collections.js";
import { costsRouter } from "./routers/costs.js";
import { settingsRouter } from "./routers/settings.js";

export const appRouter = router({
  healthz: publicProcedure.output(z.object({ ok: z.literal(true) })).query(() => ({
    ok: true as const
  })),
  collections: collectionsRouter,
  costs: costsRouter,
  settings: settingsRouter
});

export type AppRouter = typeof appRouter;
