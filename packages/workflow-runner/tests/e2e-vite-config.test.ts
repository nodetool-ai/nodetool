import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Alias, UserConfig } from "vite";

import e2eViteConfig from "../e2e/vite.config.js";
import * as fsPromisesStub from "../e2e/stubs/fs-promises-stub.js";

/**
 * Guards the Node-builtin stub table the browser E2E harness resolves through.
 *
 * The harness bundles server code into a browser bundle and answers every Node
 * builtin with a stub. Getting that table wrong does not fail loudly — it takes
 * out Vite's dependency pre-bundle, every module request answers 504, and all
 * 27 specs time out on `window.workflowRunnerReady` with nothing pointing at
 * the cause. These assertions pin the two edges that bite.
 */

const aliases = ((e2eViteConfig as UserConfig).resolve?.alias ?? []) as Alias[];
const finds = aliases.map((entry) => entry.find as string);

const findFor = (specifier: string): string | undefined =>
  aliases.find((entry) => entry.find === specifier)?.replacement;

describe("e2e harness Node-builtin stubs", () => {
  // `pptxgenjs` depends on an empty squatter package named `https`, so a bare
  // `import('https')` — the form `@opentelemetry/otlp-exporter-base` uses —
  // resolves to it and the pre-bundle dies on its missing entry point.
  it.each(["http", "https"])(
    "stubs bare %s so it cannot resolve to a node_modules squatter",
    (specifier) => {
      expect(findFor(specifier)).toMatch(/stubs\//);
    }
  );

  it("stubs every builtin under its node: specifier", () => {
    for (const bare of ["fs", "path", "os", "stream", "buffer", "https"]) {
      expect(findFor(`node:${bare}`)).toMatch(/stubs\//);
    }
  });

  // `buffer-stub.js` imports the real npm `buffer`, and `stream-stub.js` pulls
  // `readable-stream`, which reaches npm `events`, `string_decoder` and
  // `buffer` by bare name. Stubbing these would make the stubs import
  // themselves.
  it.each(["buffer", "events", "stream", "util", "process", "string_decoder"])(
    "leaves bare %s to its npm shim",
    (specifier) => {
      expect(finds).not.toContain(specifier);
    }
  );

  // Vite matches a string `find` as a path prefix, so a `fs` entry placed
  // first would swallow `fs/promises`.
  it.each(["fs/promises", "node:fs/promises"])(
    "offers %s before its parent",
    (specifier) => {
      const parent = specifier.replace("/promises", "");
      expect(finds.indexOf(specifier)).toBeGreaterThanOrEqual(0);
      expect(finds.indexOf(specifier)).toBeLessThan(finds.indexOf(parent));
    }
  );
});

/**
 * A stub answers a builtin only for the names it exports. A browser has no
 * late binding for a missing one: the first module that imports a name the
 * stub lacks fails to link, the page never reaches
 * `window.workflowRunnerReady`, and every spec times out.
 *
 * `@nodetool-ai/storage` is in the harness bundle through the kernel's
 * config and workspace imports, and its file adapter is where new
 * `fs/promises` names arrive.
 */
describe("e2e harness fs/promises stub", () => {
  const storageSrc = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../storage/src"
  );
  const namedImport =
    /import\s*\{([^}]*)\}\s*from\s*"(?:node:)?fs\/promises"/g;

  /** Every value name the storage sources import from `fs/promises`. */
  function importedNames(): string[] {
    const names = new Set<string>();
    for (const entry of readdirSync(storageSrc, { recursive: true })) {
      const file = String(entry);
      if (!file.endsWith(".ts") || file.endsWith(".d.ts")) continue;
      const source = readFileSync(join(storageSrc, file), "utf8");
      for (const match of source.matchAll(namedImport)) {
        for (const part of (match[1] ?? "").split(",")) {
          const name = part.trim().split(/\s+as\s+/)[0] ?? "";
          if (name && !name.startsWith("type ")) names.add(name);
        }
      }
    }
    return [...names].sort();
  }

  it("exports every name the storage package imports from fs/promises", () => {
    const names = importedNames();
    // The audit read the sources: these two have been imported from the start.
    expect(names).toEqual(expect.arrayContaining(["open", "rename"]));

    const missing = names.filter((name) => !(name in fsPromisesStub));
    expect(missing).toEqual([]);
  });

  it("answers a stubbed name with an error that names it", () => {
    const stub: Record<string, unknown> = fsPromisesStub;
    const link = stub["link"];
    expect(link).toBeTypeOf("function");
    expect(() => (link as (...args: string[]) => void)("a", "b")).toThrow(
      /fs\/promises\.link called from a browser bundle/
    );
  });
});
