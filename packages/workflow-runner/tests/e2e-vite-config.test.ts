import { describe, expect, it } from "vitest";
import type { Alias, UserConfig } from "vite";

import e2eViteConfig from "../e2e/vite.config.js";

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
