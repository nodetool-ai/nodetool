// Module specifiers that node code imports and a host capability provides,
// mapped onto their guest wrappers in this directory. guest/build.mjs uses
// this map in the default profile and guest/parity/profile.mjs in the parity
// profile, ahead of their shims and stubs.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const HOST_MODULES = {
  "node:crypto": join(here, "..", "shims", "crypto.cjs"),
  "crypto": join(here, "..", "shims", "crypto.cjs"),
  "@nodetool-ai/agents": join(here, "agents.mjs"),
  "@nodetool-ai/agents/js-sandbox": join(here, "sandbox.mjs"),
  "@nodetool-ai/gpu/node": join(here, "gpu-node.mjs"),
  "better-sqlite3": join(here, "sqlite.mjs"),
  "sqlite-vec": join(here, "sqlite-vec.mjs")
};
