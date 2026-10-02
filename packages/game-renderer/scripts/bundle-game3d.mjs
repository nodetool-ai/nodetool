import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const base = { bundle: true, platform: "browser", target: "es2022", minify: true, conditions: ["nodetool-dev"], logLevel: "warning" };
await build({ ...base, entryPoints: [join(root, "src/renderer3d/capture-page.ts")], outfile: join(root, "dist/game3d-capture-page.js"), format: "iife" });
await build({ ...base, entryPoints: [join(root, "src/standalone-player3d.ts")], outfile: join(root, "dist/game3d-player.js"), format: "esm" });
await build({ ...base, entryPoints: [join(root, "src/standalone-player.ts")], outfile: join(root, "dist/player-v1.js"), format: "esm" });
