import { fileURLToPath } from "node:url";

/** Run the full command tree only after the administrator explicitly loads this package. */
export async function run(argv: readonly string[] = process.argv): Promise<void> {
  const entry = new URL(import.meta.url.endsWith(".ts") ? "./nodetool.ts" : "./nodetool.js", import.meta.url);
  process.argv = [argv[0] ?? process.execPath, fileURLToPath(entry), ...argv.slice(2)];
  await import("./nodetool.js");
}

export const descriptor = { id: "cli-full", apiVersion: 1, requires: [], capabilities: ["cli:full"] } as const;
export const feature = { descriptor, run };
export default feature;
