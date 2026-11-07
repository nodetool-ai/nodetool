// The modules base-nodes imports its node lists from, read from its built
// index without loading it. They are the inputs of the parity guest profile
// and the source of each node's module in the inventory.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

export function baseNodeModules() {
  const require = createRequire(import.meta.url);
  const source = readFileSync(require.resolve("@nodetool-ai/base-nodes"), "utf8");
  const specs = [...source.matchAll(/from\s+"(@nodetool-ai\/[^"]+)"/g)].map((m) => m[1]);
  const unique = [...new Set(specs)].filter((s) => !/^@nodetool-ai\/(node-sdk|protocol)$/.test(s));
  // Subpath modules first, so a class maps to the file that defines it rather
  // than to a package barrel that re-exports it.
  const depth = (s) => (s.split("/").length > 2 ? 0 : 1);
  return unique.sort((a, b) => depth(a) - depth(b));
}
