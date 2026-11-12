/**
 * The ACE-Step 1.5 GGUF files the acestep provider asks `ace-server` for.
 *
 * `ace-server` names every model by its file name in the `--models` folder
 * (acestep.cpp `src/model-registry.h:33`), and a request selects one through
 * `synth_model` and `lm_model`. A model id here is therefore the file name.
 * The files come from the Hugging Face repository below, as acestep.cpp
 * `models.sh` and `docs/ARCHITECTURE.md:61-86` list them.
 */
import type { MusicTaskName } from "./types.js";

export const ACESTEP_REPO_ID = "Serveurperso/ACE-Step-1.5-GGUF";

export type AceStepModelKind = "text_encoder" | "lm" | "dit_turbo" | "dit_base" | "vae";

export interface AceStepModelSpec {
  /** The GGUF file name, which is also the id `ace-server` selects it by. */
  id: string;
  name: string;
  kind: AceStepModelKind;
  repoId: string;
  /** Size in GB where `ARCHITECTURE.md:76-81` states it. */
  sizeGb?: number;
  /** Part of the first-run download set (MUSIC-MODE.md section 12.4). */
  firstRun: boolean;
}

const spec = (
  id: string,
  name: string,
  kind: AceStepModelKind,
  firstRun: boolean,
  sizeGb?: number
): AceStepModelSpec => ({ id, name, kind, repoId: ACESTEP_REPO_ID, firstRun, sizeGb });

export const ACESTEP_TEXT_ENCODER = "Qwen3-Embedding-0.6B-Q8_0.gguf";
export const ACESTEP_LM_4B = "acestep-5Hz-lm-4B-Q8_0.gguf";
export const ACESTEP_TURBO_DIT = "acestep-v15-turbo-Q8_0.gguf";
export const ACESTEP_BASE_DIT = "acestep-v15-base-Q8_0.gguf";
export const ACESTEP_VAE = "vae-BF16.gguf";

export const ACESTEP_MODELS: readonly AceStepModelSpec[] = [
  spec(ACESTEP_TEXT_ENCODER, "Qwen3 Embedding 0.6B (text encoder)", "text_encoder", true, 0.748),
  spec("acestep-5Hz-lm-0.6B-Q8_0.gguf", "ACE-Step LM 0.6B", "lm", false),
  spec("acestep-5Hz-lm-1.7B-Q8_0.gguf", "ACE-Step LM 1.7B", "lm", false),
  spec(ACESTEP_LM_4B, "ACE-Step LM 4B", "lm", true, 4.2),
  spec(ACESTEP_TURBO_DIT, "ACE-Step 1.5 turbo DiT", "dit_turbo", true, 2.4),
  spec(ACESTEP_BASE_DIT, "ACE-Step 1.5 base DiT", "dit_base", false),
  spec(ACESTEP_VAE, "ACE-Step VAE", "vae", true, 0.322)
];

export function aceStepModel(id: string): AceStepModelSpec | null {
  return ACESTEP_MODELS.find((model) => model.id === id) ?? null;
}

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
