/**
 * Load `FAL_API_KEY` (and other vars) from the nodetool repo root `.env` when running
 * the CLI from `packages/fal-codegen`. Does not override variables already set in the shell.
 */

import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** `packages/fal-codegen/src` or `packages/fal-codegen/dist` */
const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url));

/** Monorepo root (`nodetool/`), three levels above this package's src or dist. */
export function resolveNodetoolRepoRoot(): string {
  return join(PACKAGE_DIR, "..", "..", "..");
}

export function loadNodetoolDotenv(): void {
  const root = resolveNodetoolRepoRoot();
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) {
    return;
  }
  config({ path: envPath });
}
