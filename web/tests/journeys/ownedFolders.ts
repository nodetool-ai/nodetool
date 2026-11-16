/**
 * The folders the journey server writes project files into.
 *
 * Every document a project folder holds (workflow and timeline JSON, media)
 * is a file the server reads back into the database. The per-test database
 * reset (`/api/test/reset`) does not touch those files, so a file left by one
 * test reappears in the next as a document nobody seeded: the Personal
 * project gained a full copy of the seed per test, the app opened a tab for
 * each, and later journeys could not click through them. The fixture empties
 * the folders before each reset.
 */

import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/** JSON list of the directories `globalSetup` created and therefore owns. */
export const OWNED_FOLDERS_ENV = "NODETOOL_JOURNEY_OWNED_FOLDERS";

/**
 * Empty the directories this run created, and only those. A directory the
 * caller supplied through `PROJECTS_DIR` or `NODETOOL_WORKSPACES_DIR` may hold
 * real work and is left alone.
 */
export function emptyOwnedFolders(): void {
  const raw = process.env[OWNED_FOLDERS_ENV];
  const dirs: unknown = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(dirs)) {
    return;
  }
  for (const dir of dirs) {
    if (typeof dir !== "string" || dir === "") {
      continue;
    }
    mkdirSync(dir, { recursive: true });
    for (const entry of readdirSync(dir)) {
      rmSync(join(dir, entry), { recursive: true, force: true });
    }
  }
}
