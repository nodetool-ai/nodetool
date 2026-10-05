import { z } from "zod";
import { router, publicProcedure } from "./index.js";
import { assetsRouter } from "./routers/assets.js";
import { codeGenRouter } from "./routers/code-gen.js";
import { segmentationRouter } from "./routers/segmentation.js";
import { collectionsRouter } from "./routers/collections.js";
import { costsRouter } from "./routers/costs.js";
import { customProvidersRouter } from "./routers/custom-providers.js";
import { externalMcpRouter } from "./routers/external-mcp.js";
import { creditsRouter } from "./routers/credits.js";
import { extensionRouter } from "./routers/extension.js";
import { documentsRouter } from "./routers/documents.js";
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
import { projectsRouter } from "./routers/projects.js";
import { scriptsRouter } from "./routers/scripts.js";
import { settingsRouter } from "./routers/settings.js";
import { fontsRouter } from "./routers/fonts.js";
import { storageRouter } from "./routers/storage.js";
import { threadsRouter } from "./routers/threads.js";
import { memoriesRouter } from "./routers/memories.js";
import { errorTracesRouter } from "./routers/error-traces.js";
import { bugReportsRouter } from "./routers/bug-reports.js";
import { sketchRouter } from "./routers/sketch.js";
import { gamesRouter } from "./routers/games.js";
import { storyboardsRouter } from "./routers/storyboards.js";
import { skillsRouter } from "./routers/skills.js";
import { appInstancesRouter } from "./routers/app-instances.js";
import { appRunsRouter } from "./routers/app-runs.js";
import { runsRouter } from "./routers/runs.js";
import { applicationsRouter } from "./routers/applications.js";
import { resourcesRouter } from "./routers/resources.js";
import { timelineRouter } from "./routers/timeline.js";
import { usersRouter } from "./routers/users.js";
import { workerRouter } from "./routers/worker.js";
import { workflowsRouter } from "./routers/workflows.js";
import { workspaceRouter } from "./routers/workspace.js";

const healthzProcedure = publicProcedure.output(z.object({ ok: z.literal(true) })).query(() => ({ ok: true as const }));
type AppRouterRecord = {
  healthz: typeof healthzProcedure;
  assets: typeof assetsRouter;
  codeGen: typeof codeGenRouter;
  segmentation: typeof segmentationRouter;
  collections: typeof collectionsRouter;
  costs: typeof costsRouter;
  credits: typeof creditsRouter;
  customProviders: typeof customProvidersRouter;
  documents: typeof documentsRouter;
  externalMcp: typeof externalMcpRouter;
  extension: typeof extensionRouter;
  files: typeof filesRouter;
  fonts: typeof fontsRouter;
  games: typeof gamesRouter;
  integrations: typeof integrationsRouter;
  jobs: typeof jobsRouter;
  jsScripts: typeof jsScriptsRouter;
  triggers: typeof triggersRouter;
  agentAccess: typeof agentAccessRouter;
  mcpConfig: typeof mcpConfigRouter;
  messages: typeof messagesRouter;
  models: typeof modelsRouter;
  nodes: typeof nodesRouter;
  packs: typeof packsRouter;
  projects: typeof projectsRouter;
  scripts: typeof scriptsRouter;
  settings: typeof settingsRouter;
  sketch: typeof sketchRouter;
  storyboards: typeof storyboardsRouter;
  skills: typeof skillsRouter;
  applications: typeof applicationsRouter;
  appInstances: typeof appInstancesRouter;
  runs: typeof runsRouter;
  appRuns: typeof appRunsRouter;
  resources: typeof resourcesRouter;
  storage: typeof storageRouter;
  threads: typeof threadsRouter;
  memories: typeof memoriesRouter;
  errorTraces: typeof errorTracesRouter;
  bugReports: typeof bugReportsRouter;
  timeline: typeof timelineRouter;
  users: typeof usersRouter;
  worker: typeof workerRouter;
  workflows: typeof workflowsRouter;
  workspace: typeof workspaceRouter;
};

export const appRouter: ReturnType<typeof router<AppRouterRecord>> = router({
  healthz: healthzProcedure,
  assets: assetsRouter,
  codeGen: codeGenRouter,
  segmentation: segmentationRouter,
  collections: collectionsRouter,
  costs: costsRouter,
  credits: creditsRouter,
  customProviders: customProvidersRouter,
  documents: documentsRouter,
  externalMcp: externalMcpRouter,
  extension: extensionRouter,
  files: filesRouter,
  fonts: fontsRouter,
  games: gamesRouter,
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
  projects: projectsRouter,
  scripts: scriptsRouter,
  settings: settingsRouter,
  sketch: sketchRouter,
  storyboards: storyboardsRouter,
  skills: skillsRouter,
  applications: applicationsRouter,
  appInstances: appInstancesRouter,
  runs: runsRouter,
  appRuns: appRunsRouter,
  resources: resourcesRouter,
  storage: storageRouter,
  threads: threadsRouter,
  memories: memoriesRouter,
  errorTraces: errorTracesRouter,
  bugReports: bugReportsRouter,
  timeline: timelineRouter,
  users: usersRouter,
  worker: workerRouter,
  workflows: workflowsRouter,
  workspace: workspaceRouter
});

export type AppRouter = typeof appRouter;
