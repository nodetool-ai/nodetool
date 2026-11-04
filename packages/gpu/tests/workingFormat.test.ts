import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import type { ShaderModule } from "../src/module.js";

const root = new URL("../src/shaders/", import.meta.url);
export async function modules(): Promise<ShaderModule[]> {
  const result: ShaderModule[] = [];
  for (const file of readdirSync(root, { recursive: true, encoding: "utf8" }).filter(f => f.endsWith("/module.ts")).sort()) {
    const exports = await import(fileURLToPath(new URL(file, root)));
    for (const value of Object.values(exports)) {
      if (typeof value === "object" && value !== null && "wgsl" in value) {
        // Dynamic module exports are narrowed by their shader payload.
        result.push(value as unknown as ShaderModule);
      }
    }
  }
  expect(result.length).toBeGreaterThan(0);
  return result;
}
it("preserves every resolved RGBA8 shader byte for byte", async () => {
  const actual = Object.fromEntries((await modules()).map(m => [`${m.id}@${m.version}`, m.wgsl]));
  const path = new URL("./fixtures/rgba8-wgsl.json", import.meta.url);
  expect(actual).toEqual(JSON.parse(readFileSync(path, "utf8")));
});
