// The node types the default guest runs, so the editor runs a graph in process
// only when the parity suite showed its nodes behave as on the server.
//
// Every class of the core workflow modules runs, as it always has. Beyond
// them, a node runs when parity/baseline.json records it at parity on a
// success path. Nodes covered only by an error path stay on the server, since
// their success may need a secret or the network the runner does not grant.
// Nodes that keep state in SQLite stay on the server too, because a runner
// without a SQLite directory loses that state when the run ends.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const CORE_MODULES = [
  "@nodetool-ai/core-nodes/nodes/constant",
  "@nodetool-ai/core-nodes/nodes/control",
  "@nodetool-ai/core-nodes/nodes/input"
];

const STATEFUL_PREFIXES = ["vector.", "lib.sqlite."];

export function localAdmission(baselinePath = join(here, "..", "parity", "baseline.json")) {
  const { nodes } = JSON.parse(readFileSync(baselinePath, "utf8"));
  const types = Object.entries(nodes)
    .filter(([type, entry]) =>
      entry.status === "parity" &&
      !(entry.reason ?? "").includes("only the error path") &&
      !STATEFUL_PREFIXES.some((prefix) => type.startsWith(prefix)))
    .map(([type]) => type)
    .sort();
  return { modules: CORE_MODULES, types };
}
