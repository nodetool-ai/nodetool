import type { CapabilitySpec } from "./types.js";
import { agentsSpecs } from "./agents.specs.js";
import { analysisSpecs } from "./analysis.specs.js";
import { apifySpecs } from "./apify.specs.js";
import { appsSpecs } from "./apps.specs.js";
import { assetsSpecs } from "./assets.specs.js";
import { browserSpecs } from "./browser.specs.js";
import { codeSpecs } from "./code.specs.js";
import { collectionsSpecs } from "./collections.specs.js";
import { compositionsSpecs } from "./compositions.specs.js";
import { costsSpecs } from "./costs.specs.js";
import { documentsSpecs } from "./documents.specs.js";
import { emailSpecs } from "./email.specs.js";
import { exampleTimelinesSpecs } from "./example-timelines.specs.js";
import { entitiesSpecs } from "./entities.specs.js";
import { filesSpecs } from "./files.specs.js";
import { flowSpecs } from "./flow.specs.js";
import { generationsSpecs } from "./generations.specs.js";
import { googleSpecs } from "./google.specs.js";
import { jobsSpecs } from "./jobs.specs.js";
import { runsSpecs } from "./runs.specs.js";
import { errorsSpecs } from "./errors.specs.js";
import { jsScriptsSpecs } from "./js-scripts.specs.js";
import { mediaSpecs } from "./media.specs.js";
import { memorySpecs } from "./memory.specs.js";
import { model3dSpecs } from "./model3d.specs.js";
import { gameSpecs } from "./game.specs.js";
import { modelsSpecs } from "./models.specs.js";
import { nodesSpecs } from "./nodes.specs.js";
import { packsSpecs } from "./packs.specs.js";
import { projectsSpecs } from "./projects.specs.js";
import { scriptsSpecs } from "./scripts.specs.js";
import { serpApiSpecs } from "./serpapi.specs.js";
import { settingsSpecs } from "./settings.specs.js";
import { sharedSpecs } from "./shared.specs.js";
import { skillsSpecs } from "./skills.specs.js";
import { sketchesSpecs } from "./sketches.specs.js";
import { storyboardsSpecs } from "./storyboards.specs.js";
import { threadsSpecs } from "./threads.specs.js";
import { timelinesSpecs } from "./timelines.specs.js";
import { uiSpecs } from "./ui.specs.js";
import { webSpecs } from "./web.specs.js";
import { videoProductionSpecs } from "./video-production.specs.js";
import { workflowsSpecs } from "./workflows.specs.js";

export const CAPABILITY_SPECS = {
  workflows: workflowsSpecs,
  models: modelsSpecs,
  media: mediaSpecs,
  collections: collectionsSpecs,
  costs: costsSpecs,
  nodes: nodesSpecs,
  jobs: jobsSpecs,
  errors: errorsSpecs,
  runs: runsSpecs,
  generations: generationsSpecs,
  assets: assetsSpecs,
  browser: browserSpecs,
  apps: appsSpecs,
  documents: documentsSpecs,
  email: emailSpecs,
  memory: memorySpecs,
  shared: sharedSpecs,
  web: webSpecs,
  "video-production": videoProductionSpecs,
  files: filesSpecs,
  agents: agentsSpecs,
  google: googleSpecs,
  threads: threadsSpecs,
  projects: projectsSpecs,
  "example-timelines": exampleTimelinesSpecs,
  timelines: timelinesSpecs,
  sketches: sketchesSpecs,
  model3d: model3dSpecs,
  game: gameSpecs,
  scripts: scriptsSpecs,
  storyboards: storyboardsSpecs,
  entities: entitiesSpecs,
  compositions: compositionsSpecs,
  code: codeSpecs,
  flow: flowSpecs,
  "js-scripts": jsScriptsSpecs,
  packs: packsSpecs,
  ui: uiSpecs,
  apify: apifySpecs,
  serpapi: serpApiSpecs,
  settings: settingsSpecs,
  skills: skillsSpecs,
  analysis: analysisSpecs
} as const satisfies Readonly<Record<string, readonly CapabilitySpec[]>>;

const SPEC_BY_NAME: ReadonlyMap<string, CapabilitySpec> = new Map(
  Object.values(CAPABILITY_SPECS).flatMap((entry) =>
    entry.map((spec) => [spec.name, spec] as const)
  )
);

const MODULE_OF_NAME: ReadonlyMap<string, string> = new Map(
  Object.entries(CAPABILITY_SPECS).flatMap(([moduleName, entry]) =>
    entry.map((spec) => [spec.name, moduleName] as const)
  )
);

/**
 * The module that owns one capability, by wire name — the namespace a guest
 * imports it from. `undefined` for a name no module declares (a session tool,
 * an external MCP tool), which is how a caller tells the two apart.
 */
export function capabilityModuleOf(name: string): string | undefined {
  return MODULE_OF_NAME.get(name);
}

/** Every registered capability's spec, read without loading a module. */
export function listCapabilitySpecs(): readonly CapabilitySpec[] {
  return [...SPEC_BY_NAME.values()];
}

/** One module's specs, read without loading it. */
export function capabilityModuleSpecTable(
  moduleName: string
): readonly CapabilitySpec[] {
  return Object.entries(CAPABILITY_SPECS).find(([name]) => name === moduleName)?.[1] ?? [];
}

/**
 * One capability's spec by wire name, synchronously. A miss means no module
 * declares that name — the belt builders treat it as a programming error.
 */
export function capabilitySpec(name: string): CapabilitySpec | undefined {
  return SPEC_BY_NAME.get(name);
}
