import { resolve } from "node:path";
import { build } from "esbuild";
import { expect, it } from "vitest";

it("keeps Three and Rapier outside the default renderer entry", async () => {
  const result = await build({ entryPoints: [resolve("src/index.ts")], bundle: true, platform: "browser", format: "esm",
    conditions: ["nodetool-dev"], write: false, metafile: true, logLevel: "silent" });
  const inputs = Object.keys(result.metafile.inputs).map((path) => path.replaceAll("\\", "/"));
  expect(inputs.some((path) => path.endsWith("src/particles/preview.ts"))).toBe(true);
  expect(inputs.filter((path) => /node_modules\/(?:three|@dimforge\/rapier[^/]*)\//.test(path))).toEqual([]);
});
