import { z } from "zod";
import { router, publicProcedure } from "./index.js";
import { assetsRouter } from "./routers/assets.js";
import { codeGenRouter } from "./routers/code-gen.js";
import { collectionsRouter } from "./routers/collections.js";
import { costsRouter } from "./routers/costs.js";
import { customProvidersRouter } from "./routers/custom-providers.js";
import { creditsRouter } from "./routers/credits.js";
import { extensionRouter } from "./routers/extension.js";
import { filesRouter } from "./routers/files.js";
import { agentAccessRouter } from "./routers/agent-access.js";
import { integrationsRouter } from "./routers/integrations.js";
import { jobsRouter } from "./routers/jobs.js";
import { jsScriptsRouter } from "./routers/js-scripts.js";
import { triggersRouter } from "./routers/triggers.js";
import { mcpConfigRouter } from "./routers/mcp-config.js";
import { messagesRouter } from "./routers/messages.js";
import { modelsRouter } from "./routers/models.js";
import { nodesRouter } from "./routers/nodes.js";
import { packsRouter } from "./routers/packs.js";
import { scriptsRouter } from "./routers/scripts.js";
import { settingsRouter } from "./routers/settings.js";
import { fontsRouter } from "./routers/fonts.js";
import { storageRouter } from "./routers/storage.js";
import { threadsRouter } from "./routers/threads.js";
import { threadMemoriesRouter } from "./routers/thread-memories.js";
import { sketchRouter } from "./routers/sketch.js";
import { storyboardsRouter } from "./routers/storyboards.js";
import { applicationsRouter } from "./routers/applications.js";
import { resourcesRouter } from "./routers/resources.js";
import { timelineRouter } from "./routers/timeline.js";
import { usersRouter } from "./routers/users.js";
import { workerRouter } from "./routers/worker.js";
import { workflowsRouter } from "./routers/workflows.js";
import { workspaceRouter } from "./routers/workspace.js";

export const appRouter = router({
  healthz: publicProcedure.output(z.object({ ok: z.literal(true) })).query(() => ({
    ok: true as const
  })),
  assets: assetsRouter,
  codeGen: codeGenRouter,
  collections: collectionsRouter,
  costs: costsRouter,
  credits: creditsRouter,
  customProviders: customProvidersRouter,
  extension: extensionRouter,
  files: filesRouter,
  fonts: fontsRouter,
  integrations: integrationsRouter,
  jobs: jobsRouter,
  jsScripts: jsScriptsRouter,
  triggers: triggersRouter,
  agentAccess: agentAccessRouter,
  mcpConfig: mcpConfigRouter,
  messages: messagesRouter,
  models: modelsRouter,
  nodes: nodesRouter,
  packs: packsRouter,
  scripts: scriptsRouter,
  settings: settingsRouter,
  sketch: sketchRouter,
  storyboards: storyboardsRouter,
  applications: applicationsRouter,
  resources: resourcesRouter,
  storage: storageRouter,
  threads: threadsRouter,
  threadMemories: threadMemoriesRouter,
  timeline: timelineRouter,
  users: usersRouter,
  worker: workerRouter,
  workflows: workflowsRouter,
  workspace: workspaceRouter
});

export type AppRouter = typeof appRouter;
