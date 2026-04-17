import { z } from "zod";
import { router, publicProcedure } from "./index.js";
import { assetsRouter } from "./routers/assets.js";
import { collectionsRouter } from "./routers/collections.js";
import { costsRouter } from "./routers/costs.js";
import { jobsRouter } from "./routers/jobs.js";
import { mcpConfigRouter } from "./routers/mcp-config.js";
import { messagesRouter } from "./routers/messages.js";
import { settingsRouter } from "./routers/settings.js";
import { skillsRouter, fontsRouter } from "./routers/skills.js";
import { threadsRouter } from "./routers/threads.js";
import { usersRouter } from "./routers/users.js";
import { workspaceRouter } from "./routers/workspace.js";

export const appRouter = router({
  healthz: publicProcedure.output(z.object({ ok: z.literal(true) })).query(() => ({
    ok: true as const
  })),
  assets: assetsRouter,
  collections: collectionsRouter,
  costs: costsRouter,
  fonts: fontsRouter,
  jobs: jobsRouter,
  mcpConfig: mcpConfigRouter,
  messages: messagesRouter,
  settings: settingsRouter,
  skills: skillsRouter,
  threads: threadsRouter,
  users: usersRouter,
  workspace: workspaceRouter
});

export type AppRouter = typeof appRouter;
