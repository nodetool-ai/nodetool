/**
 * Tests for guest sandbox modules — the entry builder and the runtime loader.
 *
 * The loader is the enforcement boundary: static validation cannot hold a
 * computed `import()`, and QuickJS resolves a cached module without asking the
 * loader. These cases pin the denials that matter, each asserting the message
 * names what was refused.
 */

import { describe, expect, it } from "vitest";
import type {
  ResolvedSandboxModule,
  SandboxModuleResolution
} from "@nodetool-ai/protocol";
import {
  buildEntryModule,
  runInSandbox,
  wrapCode
} from "../src/js-sandbox.js";
// The loading/denial contract lives as data, so the browser suite
// (packages/workflow-runner/e2e) runs the same cases in a real Chromium.
import {
  BOOTSTRAP_DROPPED_GLOBALS,
  BOOTSTRAP_MODULE_SOURCES
} from "../src/sandbox-bootstrap-modules.js";
import { loadQuickJs } from "@sebastianwessel/quickjs";
import * as quickJsVariant from "@jitl/quickjs-ng-wasmfile-release-sync";
import { createGuestModuleHost } from "../src/js-sandbox-worker/interpreter.js";
import {
  fixtureResolution,
  GEO_MODULE,
  SANDBOX_MODULE_FIXTURES
} from "../src/sandbox-module-fixtures.js";

const DIGEST = "a".repeat(64);

function resolution(modules: ResolvedSandboxModule[]): SandboxModuleResolution {
  return fixtureResolution(modules);
}

const geoOnly = resolution([GEO_MODULE]);

async function run(code: string, modules = geoOnly) {
  return runInSandbox({ code, modules, timeoutMs: 20000 });
}

// ---------------------------------------------------------------------------
// buildEntryModule
// ---------------------------------------------------------------------------

describe("buildEntryModule", () => {
  it("matches wrapCode for import-free code", () => {
    for (const code of [
      "return 42",
      "const a = await Promise.resolve(1);\nreturn a;",
      "// only a comment"
    ]) {
      expect(buildEntryModule(code)).toBe(wrapCode(code));
    }
  });

  it("falls back to wrapCode when the code does not parse", () => {
    const broken = "return {{{";
    expect(buildEntryModule(broken)).toBe(wrapCode(broken));
  });

  it("hoists imports above the wrapper and blanks their place in the body", () => {
    const source = buildEntryModule(
      'import { haversine } from "@acme/geo";\nreturn haversine(1, 2);'
    );
    const lines = source.split("\n");
    expect(lines[0]).toBe('import { haversine } from "@acme/geo";');
    expect(lines[1]).toContain("delete globalThis.setTimeout;");
    expect(lines[2]).toBe("export default await (async () => {");
    // The import's line keeps its place; only its text is blanked.
    expect(lines[3].trim()).toBe("");
    expect(lines[4]).toBe("return haversine(1, 2);");
  });

  it("hoists every import declaration onto one line", () => {
    const source = buildEntryModule(
      'import a from "@acme/geo";\nimport b from "@acme/geo/extra";\nreturn 1;'
    );
    expect(source.split("\n")[0]).toBe(
      'import a from "@acme/geo"; import b from "@acme/geo/extra";'
    );
  });

  it("leaves dynamic import() in the body", () => {
    const source = buildEntryModule(
      'import a from "@acme/geo";\nconst m = await import("@acme/geo");\nreturn 1;'
    );
    expect(source).toContain('await import("@acme/geo")');
  });
});

// ---------------------------------------------------------------------------
// Happy paths
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The shared contract, on Node's QuickJS
// ---------------------------------------------------------------------------

describe("guest module contract (shared fixtures)", () => {
  for (const fixture of SANDBOX_MODULE_FIXTURES) {
    it(`${fixture.name}: ${fixture.description}`, async () => {
      const result = await run(fixture.code, resolution([...fixture.modules]));
      if (fixture.errorContains === undefined) {
        expect(result.error).toBeUndefined();
        expect(result.result).toEqual(fixture.result);
        return;
      }
      // A caught dynamic import() returns its message; a static one fails the
      // run. The contract is what the message names, not which way it arrives.
      const reported = fixture.catchesError
        ? String(result.result)
        : String(result.error);
      expect(fixture.catchesError ? result.success : !result.success).toBe(true);
      for (const substring of fixture.errorContains) {
        expect(reported).toContain(substring);
      }
    }, 60_000);
  }

  it("changes nothing when no modules are passed", async () => {
    const result = await runInSandbox({ code: "return 1 + 1;" });
    expect(result.success).toBe(true);
    expect(result.result).toBe(2);
  });

  // A run that resolved nothing is the common case for a body whose imports
  // name no installed pack — and it is the case that has to deny hardest. The
  // loader used to be built only when something resolved, which left the
  // wrapper's own Node-compat modules reachable from a body that declared
  // nothing at all.
  for (const fixture of SANDBOX_MODULE_FIXTURES) {
    if (fixture.errorContains === undefined || fixture.catchesError) continue;
    it(`${fixture.name}: still denied when the run resolved nothing`, async () => {
      const result = await runInSandbox({
        code: fixture.code,
        timeoutMs: 20000
      });
      expect(result.success).toBe(false);
      expect(String(result.error)).toContain("not a sandbox package this run serves");
    }, 60_000);
  }
});

// ---------------------------------------------------------------------------
// Node-only: kinds the browser suite has no way to exercise yet
// ---------------------------------------------------------------------------

describe("guest module kinds", () => {
  it("refuses a WASM module whose binary cannot be read", async () => {
    const result = await runInSandbox({
      code: "return 1;",
      modules: {
        modules: [
          {
            specifier: "@acme/fast",
            packName: "@acme/nodetool-fast",
            contentDigest: DIGEST,
            moduleId: "sandbox/fast.wasm",
            kind: "wasm",
            bytes: new Uint8Array([0, 97, 115, 109]),
            wasm: { memoryPagesMax: 1, exports: [{ wasm: "run", as: "run" }] },
            graph: []
          }
        ],
        statuses: []
      }
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("truncated WASM binary");
  });
});

// ---------------------------------------------------------------------------
// The wrapper's Node-compat bootstrap
// ---------------------------------------------------------------------------

describe("the compat bootstrap loads our stubs", () => {
  // The wrapper compiles ~12KB of Node polyfills into every fresh runtime
  // before our code runs, and the prelude then deletes most of what they
  // installed. `BOOTSTRAP_MODULE_SOURCES` serves it something cheaper. These
  // cases drive the real engine, so a wrapper release that renames those
  // modules fails here rather than quietly costing 2.7ms a run.

  it("leaves the globals it no longer installs undefined", async () => {
    // Probed against the engine directly, with our module host but without our
    // init prelude: the prelude deletes these globals too, so asserting through
    // `runInSandbox` would pass whether or not a stub was ever served.
    const { runSandboxed } = await loadQuickJs(
      (quickJsVariant as { default: unknown }).default as never
    );
    const host = createGuestModuleHost(undefined);
    // Every id we stub must be one the bootstrap actually asks for. Without
    // this, a renamed module falls through to the real polyfill and the only
    // symptom is 2.7ms a run — invisible to any assertion about globals.
    const requested: string[] = [];
    const options = {
      ...host.options,
      getModuleLoader: (fs: never, runtimeOptions: never) => {
        const loader = host.options.getModuleLoader!(fs, runtimeOptions);
        return (name: string, context: never) => {
          requested.push(name);
          return loader(name, context);
        };
      }
    };
    const seen = await runSandboxed<string>(
      async ({ evalCode }) => {
        const probe = await evalCode(
          `export default ${JSON.stringify([...BOOTSTRAP_DROPPED_GLOBALS])}
            .map((name) => name + ":" + typeof globalThis[name]).join(" ");`,
          "probe"
        );
        if (!probe.ok) throw new Error("probe failed");
        return probe.data as string;
      },
      { env: {}, ...(options as typeof host.options) }
    );
    expect(seen).toBe(
      BOOTSTRAP_DROPPED_GLOBALS.map((name) => `${name}:undefined`).join(" ")
    );
    expect(requested).toEqual(
      expect.arrayContaining([...BOOTSTRAP_MODULE_SOURCES.keys()])
    );
  });

  it("keeps TextEncoder and TextDecoder, bytes unchanged", async () => {
    const result = await runInSandbox({
      code: `const bytes = new TextEncoder().encode("héllo 日本 😀");
             return {
               bytes: Array.from(bytes),
               roundTrip: new TextDecoder().decode(bytes),
               ascii: Array.from(new TextEncoder().encode("ab"))
             };`
    });
    expect(result.success).toBe(true);
    const value = result.result as {
      bytes: number[];
      roundTrip: string;
      ascii: number[];
    };
    // The same UTF-8 the wrapper's own polyfill produced: 2 bytes for é,
    // 3 each for 日本, 4 for the emoji.
    expect(value.bytes.length).toBe(18);
    expect(value.roundTrip).toBe("héllo 日本 😀");
    expect(value.ascii).toEqual([97, 98]);
    expect(
      new TextDecoder().decode(new Uint8Array(value.bytes))
    ).toBe("héllo 日本 😀");
  });

  it("rejects an encoding TextDecoder never supported", async () => {
    const result = await runInSandbox({
      code: `new TextDecoder("utf-16"); return 1;`
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("utf-8");
  });

  it("keeps URL and URLSearchParams, which it still loads from the wrapper", async () => {
    const result = await runInSandbox({
      code: `const u = new URL("https://x.test/a/b?q=1&q=2#f");
             return [u.protocol, u.hostname, u.pathname, u.search, u.hash,
                     u.searchParams.get("q"), typeof URLSearchParams].join("|");`
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe("https:|x.test|/a/b|?q=1&q=2|#f|1|function");
  });

  it("serves a stub only in the bootstrap phase", () => {
    const host = createGuestModuleHost(undefined);
    const loader = host.options.getModuleLoader!(
      undefined as never,
      undefined as never
    );
    const id = [...BOOTSTRAP_MODULE_SOURCES.keys()][0];
    expect((loader(id, undefined as never) as { value: string }).value).toBe(
      BOOTSTRAP_MODULE_SOURCES.get(id)
    );
    host.enterGuestPhase();
    expect(loader(id, undefined as never)).toHaveProperty("error");
  });
});
