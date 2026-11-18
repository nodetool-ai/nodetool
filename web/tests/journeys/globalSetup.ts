/**
 * Playwright global setup for the user-journey suite.
 *
 * Same seeded backend the smoke and visual suites use, with two differences:
 * `NODETOOL_FAKE_PROVIDERS=1` puts `screenshot-server.ts` in hermetic mode, so
 * every LLM provider and every external/media node resolves to a deterministic
 * fake. Journeys can therefore send a chat message and run a workflow with no
 * API keys and no network, while structural and pure-compute nodes still run
 * for real — a run that produces the wrong value still fails. The journey
 * fixture resets the seeded database before each test through the test-only
 * reset endpoint.
 *
 * The env var is set here rather than in the config so it applies only to this
 * suite: the screenshot and visual suites render pages and must keep the real
 * provider wiring.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharedGlobalSetup from "../globalSetup";
import { OWNED_FOLDERS_ENV } from "./ownedFolders";

export default async function journeysGlobalSetup(): Promise<
  () => Promise<void>
> {
  // Overridable so a failing journey can be re-run against real providers to
  // tell "the fake is wrong" apart from "the app is broken".
  process.env.NODETOOL_FAKE_PROVIDERS ??= "1";
  // Creating a project creates its folder, and the Personal project's folder
  // lives under the managed workspaces directory. Point both at temp
  // directories so a journey never writes into the real home directory, and
  // so the fixture can empty them between tests (see `emptyOwnedFolders`).
  // A directory the caller set is theirs and is never emptied.
  const ownedDirs: string[] = [];
  for (const name of ["PROJECTS_DIR", "NODETOOL_WORKSPACES_DIR"]) {
    if (process.env[name] === undefined) {
      const dir = mkdtempSync(join(tmpdir(), "nodetool-journey-folders-"));
      process.env[name] = dir;
      ownedDirs.push(dir);
    }
  }
  process.env[OWNED_FOLDERS_ENV] = JSON.stringify(ownedDirs);
  const teardown = await sharedGlobalSetup();
  return async () => {
    await teardown();
    for (const dir of ownedDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}
