/**
 * The ACE-Step 1.5 GGUF files the acestep provider asks `ace-server` for.
 *
 * `ace-server` names every model by its file name in the `--models` folder
 * (acestep.cpp `src/model-registry.h:33`), and a request selects one through
 * `synth_model` and `lm_model`. A model id here is therefore the file name.
 * The files come from the Hugging Face repository below, as acestep.cpp
 * `models.sh` and `docs/ARCHITECTURE.md:61-86` list them.
 */
import { ACESTEP_MODELS_REPO, aceStepModelFile } from "@nodetool-ai/config";
import type { MusicTaskName } from "./types.js";

/**
 * The model catalog (repository, file names, first-run set) lives in
 * `@nodetool-ai/config` (`acestep-models.ts`), where the installer reads it.
 * This file keeps the provider's routing only.
 */
export const ACESTEP_REPO_ID = ACESTEP_MODELS_REPO;

export const ACESTEP_TURBO_DIT = aceStepModelFile("ditTurbo").file;
export const ACESTEP_BASE_DIT = aceStepModelFile("ditBase").file;

/**
 * Tasks the turbo DiT cannot run (`ARCHITECTURE.md:395-405`): lego, extract
 * and complete need the base or SFT DiT.
 */
const BASE_ONLY_TASKS: ReadonlySet<MusicTaskName> = new Set(["lego", "extract", "complete"]);

/** Whether a DiT file is a turbo variant (turbo, turbo-shift1, xl-turbo, ...). */
function isTurboDit(file: string): boolean {
  return /turbo/i.test(file);
}

/**
 * The DiT for a task (BE-3): the turbo DiT for Generate and Regenerate, the
 * base DiT for Add instrument. A requested DiT is kept when it can run the
 * task. A turbo DiT asked to run a base-only task is replaced by the base DiT,
 * because `ace-server` would otherwise load a model that cannot do the job.
 */
export function aceStepDitFor(task: MusicTaskName, requested?: string): string {
  const wanted = requested?.trim();
  const baseOnly = BASE_ONLY_TASKS.has(task);
  if (wanted && !(baseOnly && isTurboDit(wanted))) {
    return wanted;
  }
  return baseOnly ? ACESTEP_BASE_DIT : ACESTEP_TURBO_DIT;
}
