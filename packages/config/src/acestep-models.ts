/**
 * The ACE-Step model files `ace-server` loads, and what is on disk.
 *
 * Every file comes from one Hugging Face repository as a pre-quantized GGUF.
 * `ace-server --models <dir>` scans a directory for `.gguf` files and
 * classifies each by its `general.architecture` metadata, so the directory
 * holds the files under their plain names. A request names a DiT or language
 * model by file name (`synth_model`, `lm_model`).
 *
 * The file names and quantisations follow `models.sh` and
 * `docs/ARCHITECTURE.md` (Models) of acestep.cpp at the commit pinned in
 * `acestep-runtime.ts`. The installer downloads through the Hugging Face
 * downloader in `@nodetool-ai/runtime-install`.
 */
import { importNodeBuiltin } from "./node-import.js";

export const ACESTEP_MODELS_REPO = "Serveurperso/ACE-Step-1.5-GGUF";

export type AceStepModelRole = "textEncoder" | "languageModel" | "ditTurbo" | "vae" | "ditBase";

export type AceStepLmSize = "0.6B" | "1.7B" | "4B";

/** The language model size NodeTool installs. The MM0 spike may change it (MQ6). */
export const ACESTEP_DEFAULT_LM_SIZE: AceStepLmSize = "4B";

export interface AceStepModelFile {
  readonly role: AceStepModelRole;
  /** The file name in the repository and in the models directory. */
  readonly file: string;
  /** Approximate size in bytes, for the "about 7.7 GB" total shown before a download. */
  readonly approxBytes: number;
}

const MB = 1_000_000;
const GB = 1_000_000_000;

const LM_APPROX_BYTES: Record<AceStepLmSize, number> = {
  "0.6B": 700 * MB,
  "1.7B": 1.9 * GB,
  "4B": 4.2 * GB
};

/**
 * The first-run set: text encoder, language model, turbo DiT and VAE, about
 * 7.7 GB at Q8 with the 4B language model. Sizes of the first four files are
 * the ones in `docs/ARCHITECTURE.md`.
 */
export const ACESTEP_FIRST_RUN_ROLES: readonly AceStepModelRole[] = [
  "textEncoder",
  "languageModel",
  "ditTurbo",
  "vae"
];

/** The base DiT, downloaded on the first Add instrument (lego needs it). */
export const ACESTEP_ADD_INSTRUMENT_ROLES: readonly AceStepModelRole[] = ["ditBase"];

/** The file for each role. The base DiT size is an estimate: it matches the turbo DiT's layout. */
export function aceStepModelFile(
  role: AceStepModelRole,
  lmSize: AceStepLmSize = ACESTEP_DEFAULT_LM_SIZE
): AceStepModelFile {
  switch (role) {
    case "textEncoder":
      return { role, file: "Qwen3-Embedding-0.6B-Q8_0.gguf", approxBytes: 748 * MB };
    case "languageModel":
      return { role, file: `acestep-5Hz-lm-${lmSize}-Q8_0.gguf`, approxBytes: LM_APPROX_BYTES[lmSize] };
    case "ditTurbo":
      return { role, file: "acestep-v15-turbo-Q8_0.gguf", approxBytes: 2.4 * GB };
    case "ditBase":
      return { role, file: "acestep-v15-base-Q8_0.gguf", approxBytes: 2.4 * GB };
    case "vae":
      return { role, file: "vae-BF16.gguf", approxBytes: 322 * MB };
  }
}

export function aceStepModelFiles(
  roles: readonly AceStepModelRole[],
  lmSize: AceStepLmSize = ACESTEP_DEFAULT_LM_SIZE
): AceStepModelFile[] {
  return roles.map((role) => aceStepModelFile(role, lmSize));
}

export interface AceStepModelStatus {
  /** Roles whose file is in the models directory. */
  present: AceStepModelRole[];
  missing: AceStepModelRole[];
  /** Every checked file, present or not. */
  files: Array<AceStepModelFile & { present: boolean }>;
}

/**
 * Report which of the files for `roles` are in `modelsDir`. A file counts when
 * it exists and is not empty. A symbolic link counts when its target does,
 * since `ace-server` follows links when it scans the directory.
 */
export async function aceStepModelStatus(
  modelsDir: string,
  roles: readonly AceStepModelRole[] = [...ACESTEP_FIRST_RUN_ROLES, ...ACESTEP_ADD_INSTRUMENT_ROLES],
  lmSize: AceStepLmSize = ACESTEP_DEFAULT_LM_SIZE
): Promise<AceStepModelStatus> {
  const fs = await importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises");
  const path = await importNodeBuiltin<typeof import("node:path")>("node:path");
  if (!fs || !path) {
    throw new Error("Reading the ACE-Step models directory requires Node.js");
  }
  const files = await Promise.all(
    aceStepModelFiles(roles, lmSize).map(async (entry) => {
      const info = await fs.stat(path.join(modelsDir, entry.file)).catch(() => null);
      return { ...entry, present: info !== null && info.isFile() && info.size > 0 };
    })
  );
  return {
    present: files.filter((f) => f.present).map((f) => f.role),
    missing: files.filter((f) => !f.present).map((f) => f.role),
    files
  };
}
