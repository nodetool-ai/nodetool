import { z } from "zod";
import { router, publicProcedure } from "./index.js";
import { assetsRouter } from "./routers/assets.js";
import { collectionsRouter } from "./routers/collections.js";
import { costsRouter } from "./routers/costs.js";
import { filesRouter } from "./routers/files.js";
import { jobsRouter } from "./routers/jobs.js";
import { mcpConfigRouter } from "./routers/mcp-config.js";
import { messagesRouter } from "./routers/messages.js";
import { modelsRouter } from "./routers/models.js";
import { nodesRouter } from "./routers/nodes.js";
import { settingsRouter } from "./routers/settings.js";
import { skillsRouter, fontsRouter } from "./routers/skills.js";
import { storageRouter } from "./routers/storage.js";
import { threadsRouter } from "./routers/threads.js";
import { usersRouter } from "./routers/users.js";
import { workflowsRouter } from "./routers/workflows.js";
import { workspaceRouter } from "./routers/workspace.js";

export const appRouter = router({
  healthz: publicProcedure.output(z.object({ ok: z.literal(true) })).query(() => ({
    ok: true as const
  })),
  assets: assetsRouter,
  collections: collectionsRouter,
  costs: costsRouter,
  files: filesRouter,
  fonts: fontsRouter,
  jobs: jobsRouter,
  mcpConfig: mcpConfigRouter,
  messages: messagesRouter,
  models: modelsRouter,
  nodes: nodesRouter,
  settings: settingsRouter,
  skills: skillsRouter,
  storage: storageRouter,
  threads: threadsRouter,
  users: usersRouter,
  workflows: workflowsRouter,
  workspace: workspaceRouter
});

export type AppRouter = typeof appRouter;
