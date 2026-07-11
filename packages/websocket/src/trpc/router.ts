import { z } from "zod";
import { router, publicProcedure } from "./index.js";
import { assetsRouter } from "./routers/assets.js";
import { collectionsRouter } from "./routers/collections.js";
import { costsRouter } from "./routers/costs.js";
import { extensionRouter } from "./routers/extension.js";
import { filesRouter } from "./routers/files.js";
import { jobsRouter } from "./routers/jobs.js";
import { mcpConfigRouter } from "./routers/mcp-config.js";
import { messagesRouter } from "./routers/messages.js";
import { modelsRouter } from "./routers/models.js";
import { nodesRouter } from "./routers/nodes.js";
import { packsRouter } from "./routers/packs.js";
import { sandboxesRouter } from "./routers/sandboxes.js";
import { settingsRouter } from "./routers/settings.js";
import { skillsRouter, fontsRouter } from "./routers/skills.js";
import { storageRouter } from "./routers/storage.js";
import { threadsRouter } from "./routers/threads.js";
import { sketchRouter } from "./routers/sketch.js";
import { timelineRouter } from "./routers/timeline.js";
import { triggersRouter } from "./routers/triggers.js";
import { usersRouter } from "./routers/users.js";
import { workerRouter } from "./routers/worker.js";
import { workflowsRouter } from "./routers/workflows.js";
import { workspaceRouter } from "./routers/workspace.js";

export const appRouter = router({
  healthz: publicProcedure.output(z.object({ ok: z.literal(true) })).query(() => ({
    ok: true as const
  })),
  assets: assetsRouter,
  collections: collectionsRouter,
  costs: costsRouter,
  extension: extensionRouter,
  files: filesRouter,
  fonts: fontsRouter,
  jobs: jobsRouter,
  mcpConfig: mcpConfigRouter,
  messages: messagesRouter,
  models: modelsRouter,
  nodes: nodesRouter,
  packs: packsRouter,
  sandboxes: sandboxesRouter,
  settings: settingsRouter,
  sketch: sketchRouter,
  skills: skillsRouter,
  storage: storageRouter,
  threads: threadsRouter,
  timeline: timelineRouter,
  triggers: triggersRouter,
  users: usersRouter,
  worker: workerRouter,
  workflows: workflowsRouter,
  workspace: workspaceRouter
});

export type AppRouter = typeof appRouter;
