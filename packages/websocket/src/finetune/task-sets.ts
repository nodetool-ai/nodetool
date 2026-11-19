/**
 * Every task the fine-tuning sampler can run, split into training and
 * validation tasks. The sampler and the validation-manifest test build the
 * split from here, so they cannot disagree about it.
 */
import {
  AUDIO_TOOL_LOOP_CASES,
  JOBS_TO_BE_DONE,
  JS_SCRIPT_TOOL_LOOP_CASES,
  MODEL3D_TOOL_LOOP_CASES,
  SCRIPT_TOOL_LOOP_CASES,
  SKETCH_TOOL_LOOP_CASES,
  STORYBOARD_TOOL_LOOP_CASES,
  SVG_TOOL_LOOP_CASES,
  TIMELINE_TOOL_LOOP_CASES,
  listCapabilitySpecs,
  type ErasedJob
} from "@nodetool-ai/agents";
import { CAPABILITY_FAMILIES } from "./families/capabilities.js";
import { JSSCRIPT_APP_FAMILIES } from "./families/jsscript-app.js";
import { SKETCH_AUDIO_FAMILIES } from "./families/sketch-audio.js";
import { STORYBOARD_SCRIPT_FAMILIES } from "./families/storyboard-script.js";
import { TASK_FAMILIES, type ErasedFamily } from "./task-families.js";
import { suiteJobs } from "./tool-loop-jobs.js";
import { splitTasks, type Split } from "./validation.js";

export const FINETUNE_FAMILIES: readonly ErasedFamily[] = [
  ...TASK_FAMILIES,
  ...SKETCH_AUDIO_FAMILIES,
  ...STORYBOARD_SCRIPT_FAMILIES,
  ...JSSCRIPT_APP_FAMILIES,
  ...CAPABILITY_FAMILIES
];

/** The jobs and the `tool-loop` suites, each with the editor the browser would focus. */
export function evalSuiteTasks(): ErasedJob[] {
  return [
    ...JOBS_TO_BE_DONE.filter((job) => job.needsModelProviders !== true),
    ...suiteJobs("timeline-tools", TIMELINE_TOOL_LOOP_CASES, "timeline"),
    ...suiteJobs("sketch-tools", SKETCH_TOOL_LOOP_CASES, "sketch"),
    ...suiteJobs("storyboard-tools", STORYBOARD_TOOL_LOOP_CASES, "storyboard"),
    ...suiteJobs("script-tools", SCRIPT_TOOL_LOOP_CASES, "script"),
    ...suiteJobs("js-script-tools", JS_SCRIPT_TOOL_LOOP_CASES, "jsscript"),
    ...suiteJobs("svg-tools", SVG_TOOL_LOOP_CASES, "svg"),
    ...suiteJobs("audio-tools", AUDIO_TOOL_LOOP_CASES, "audio"),
    // The 3D editor has no focus type. The memory suite is left out: its world
    // re-creates the database the chat session is using, and its tools are
    // server capabilities in any case.
    ...suiteJobs("model3d-tools", MODEL3D_TOOL_LOOP_CASES)
  ];
}

/**
 * The split with every task the chat path cannot run removed: a job whose
 * browser tools share a name with a server capability never reaches its
 * bridge, so its grade would be meaningless.
 */
export async function runnableSplit(trainPerFamily: number): Promise<Split> {
  const serverToolNames = new Set(listCapabilitySpecs().map((spec) => spec.name));
  const split = splitTasks(evalSuiteTasks(), FINETUNE_FAMILIES, trainPerFamily);
  const runnable = async (jobs: ErasedJob[]): Promise<ErasedJob[]> => {
    const kept: ErasedJob[] = [];
    for (const job of jobs) {
      const world = await job.start();
      if (!world.tools.some((tool) => serverToolNames.has(tool.name))) kept.push(job);
    }
    return kept;
  };
  return { train: await runnable(split.train), validation: await runnable(split.validation) };
}
