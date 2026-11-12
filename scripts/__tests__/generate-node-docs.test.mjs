import { afterEach, expect, it } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const temporary = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});
it("documents inherited controls from a relative imported base and applies child overrides once", () => {
  const dir = mkdtempSync(join(tmpdir(), "nodetool-inherited-docs-"));
  temporary.push(dir);
  const scripts = join(dir, "scripts");
  const source = join(dir, "packages", "fixture", "src");
  mkdirSync(scripts, { recursive: true });
  mkdirSync(source, { recursive: true });
  writeFileSync(
    join(scripts, "generate-node-docs.mjs"),
    readFileSync(join(root, "scripts/generate-node-docs.mjs"))
  );
  writeFileSync(
    join(source, "controls.ts"),
    `export abstract class Controls {
    @prop({ type: "float", default: 0.5, title: "Delay Seconds" }) declare delay_seconds: number;
  }`
  );
  writeFileSync(
    join(source, "effects.ts"),
    `import { Controls as Parameters } from "./controls.js";
  export class Clip extends Parameters {
    static readonly nodeType = "test.audio.Clip";
    static readonly title = "Clip";
    @prop({ type: "audio", default: null }) declare audio: unknown;
  }
  export class Signal extends Parameters {
    static readonly nodeType = "test.audio.Signal";
    static readonly title = "Signal";
    @prop({ type: "float", default: 0.25 }) declare delay_seconds: number;
  }`
  );
  appendFileSync(
    join(source, "effects.ts"),
    Array.from(
      { length: 1000 },
      (_, i) => `
    export class Generated${i} extends Parameters {
      static readonly nodeType = "test.audio.Generated${i}";
      static readonly title = "Generated${i}";
    }`
    ).join("\n")
  );
  const out = join(dir, "docs");
  const result = spawnSync(
    process.execPath,
    [join(scripts, "generate-node-docs.mjs"), "--out", out],
    {
      encoding: "utf8",
      env: { ...process.env, NODE_PATH: join(root, "node_modules") }
    }
  );
  expect(result.status, result.stderr).toBe(0);
  const clip = readFileSync(join(out, "test/audio/clip.md"), "utf8");
  expect(clip).toContain("| delay_seconds | `float` |  | `0.5` |");
  const signal = readFileSync(join(out, "test/audio/signal.md"), "utf8");
  expect(signal).toContain("| delay_seconds | `float` |  | `0.25` |");
  expect(signal.match(/\| delay_seconds \|/g)).toHaveLength(1);
  const catalog = JSON.parse(readFileSync(join(out, "catalog.json"), "utf8"));
  expect(catalog.nodes).toHaveLength(1002);
  expect(
    readFileSync(join(out, "test/audio/generated999.md"), "utf8")
  ).toContain("| delay_seconds | `float` |  | `0.5` |");
});
