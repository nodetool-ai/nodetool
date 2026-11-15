import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (!process.env.SECRETS_MASTER_KEY) {
  process.env.SECRETS_MASTER_KEY = randomBytes(32).toString("base64");
}

// Creating a project creates its folder, and Personal's folder is the managed
// default workspace. Keep both out of the real home and data directories.
const folders = mkdtempSync(join(tmpdir(), "nodetool-websocket-tests-"));
process.env.PROJECTS_DIR = join(folders, "projects");
process.env.NODETOOL_WORKSPACES_DIR = join(folders, "workspaces");
