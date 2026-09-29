import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * `@nodetool-ai/sandbox-timeline` ships `sandbox/index.d.ts` beside
 * `sandbox/index.js`, referenced by the pack's `package.json` `types` field.
 * This is the drift guard from the task: every runtime export must have a
 * matching top-level `export` declaration in the `.d.ts`, or a script that
 * imports the pack sees a type the file doesn't actually export (or worse,
 * `any`, once picked up by a checker with `noImplicitAny` off).
 */

const PACK_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "sandbox-packs",
  "sandbox-timeline"
);

describe("sandbox-timeline .d.ts", () => {
  it("declares every runtime export index.js has", async () => {
    const runtime: unknown = await import(
      /* @vite-ignore */ join(PACK_DIR, "sandbox", "index.js")
    );
    const runtimeExports = Object.keys(runtime as Record<string, unknown>).sort();
    expect(runtimeExports.length).toBeGreaterThan(0);

    const dts = readFileSync(join(PACK_DIR, "sandbox", "index.d.ts"), "utf8");
    const declared = new Set(
      [...dts.matchAll(/^export (?:declare )?(?:function|const|class) ([A-Za-z_$][A-Za-z0-9_$]*)/gm)].map(
        (match) => match[1]
      )
    );

    const missing = runtimeExports.filter((name) => !declared.has(name));
    expect(missing).toEqual([]);
  });

  it("points package.json's types field at the shipped .d.ts", () => {
    const packageJson = JSON.parse(
      readFileSync(join(PACK_DIR, "package.json"), "utf8")
    ) as { types?: string };
    expect(packageJson.types).toBe("sandbox/index.d.ts");
  });
});
