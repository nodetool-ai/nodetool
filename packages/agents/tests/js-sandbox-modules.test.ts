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

const DIGEST = "a".repeat(64);

function jsModule(
  specifier: string,
  packName: string,
  files: { id: string; source: string; internal?: boolean }[]
): ResolvedSandboxModule {
  const entry = files[0];
  return {
    specifier,
    packName,
    contentDigest: DIGEST,
    moduleId: entry.id,
    kind: "js",
    source: entry.source,
    graph: files.map((file) => ({
      id: file.id,
      kind: "js" as const,
      source: file.source,
      dependencies: [],
      internal: file.internal ?? false
    }))
  };
}

function resolution(modules: ResolvedSandboxModule[]): SandboxModuleResolution {
  return { modules, statuses: [] };
}

const GEO = jsModule("@acme/geo", "@acme/nodetool-geo", [
  {
    id: "sandbox/geo.js",
    source: `import { round } from "./internal/round.js";
export const haversine = (a, b) => round(Math.abs(a - b) * 111);`
  },
  {
    id: "sandbox/internal/round.js",
    source: "export const round = (n) => Math.round(n * 100) / 100;",
    internal: true
  }
]);

const GEO_EXTRA = jsModule("@acme/geo/extra", "@acme/nodetool-geo", [
  { id: "sandbox/extra.js", source: "export const label = () => 'extra';" }
]);

const OTHER = jsModule("@other/pack", "@other/nodetool-pack", [
  { id: "sandbox/main.js", source: "export const hi = () => 'other';" },
  {
    id: "sandbox/internal/secret.js",
    source: "export const secret = () => 'secret';",
    internal: true
  }
]);

const geoOnly = resolution([GEO]);

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

describe("guest modules", () => {
  it("imports a named export from a declared module", async () => {
    const result = await run(
      'import { haversine } from "@acme/geo";\nreturn haversine(1, 3);'
    );
    expect(result.error).toBeUndefined();
    expect(result.result).toBe(222);
  });

  it("imports two modules from one pack", async () => {
    const result = await run(
      `import { haversine } from "@acme/geo";
import { label } from "@acme/geo/extra";
return label() + ":" + haversine(0, 1);`,
      resolution([GEO, GEO_EXTRA])
    );
    expect(result.error).toBeUndefined();
    expect(result.result).toBe("extra:111");
  });

  it("lets a module import an internal sibling helper", async () => {
    // GEO's entry only works because ./internal/round.js resolves.
    const result = await run('import { haversine } from "@acme/geo";\nreturn haversine(0, 0.001);');
    expect(result.error).toBeUndefined();
    expect(result.result).toBe(0.11);
  });

  it("changes nothing when no modules are passed", async () => {
    const result = await runInSandbox({ code: "return 1 + 1;" });
    expect(result.success).toBe(true);
    expect(result.result).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Denials
// ---------------------------------------------------------------------------

describe("guest module denials", () => {
  const cases: { name: string; code: string; names: string }[] = [
    {
      name: 'static import "node:buffer"',
      code: 'import "node:buffer";\nreturn 1;',
      names: "node:buffer"
    },
    {
      name: 'static import "buffer"',
      code: 'import "buffer";\nreturn 1;',
      names: "buffer"
    },
    {
      name: 'static import "fs"',
      code: 'import "fs";\nreturn 1;',
      names: "fs"
    },
    {
      name: "absolute path",
      code: 'import "/etc/passwd";\nreturn 1;',
      names: "/etc/passwd"
    },
    {
      name: "relative escape from user code",
      code: 'import "../secrets.js";\nreturn 1;',
      names: "../secrets.js"
    },
    {
      name: "url-encoded traversal",
      code: 'import "%2e%2e/secrets.js";\nreturn 1;',
      names: "%2e%2e/secrets.js"
    },
    {
      name: "undeclared specifier",
      code: 'import "@acme/other";\nreturn 1;',
      names: "@acme/other"
    },
    {
      name: "another pack's internal file",
      code: 'import "@other/nodetool-pack/sandbox/internal/secret.js";\nreturn 1;',
      names: "sandbox/internal/secret.js"
    }
  ];

  for (const { name, code, names } of cases) {
    it(`denies ${name}`, async () => {
      const result = await run(code, resolution([GEO, OTHER]));
      expect(result.success).toBe(false);
      expect(result.error).toContain(names);
      expect(result.error).toContain("packages declaration");
    });
  }

  it("denies a declared module's internal file imported directly by user code", async () => {
    const result = await run('import "sandbox/internal/round.js";\nreturn 1;');
    expect(result.success).toBe(false);
    expect(result.error).toContain("sandbox/internal/round.js");
  });

  it("denies dynamic import of a declared specifier, including after a static import warmed the cache", async () => {
    const result = await run(
      `import { haversine } from "@acme/geo";
try {
  await import("@acme/geo");
  return "LOADED";
} catch (e) {
  return e.message;
}`
    );
    expect(result.success).toBe(true);
    expect(result.result).toContain("dynamic import()");
    expect(result.result).toContain("@acme/geo");
  });

  it("denies a computed dynamic import of a compat module", async () => {
    const result = await run(
      `try {
  await import("node:" + "buffer");
  return "LOADED";
} catch (e) {
  return e.message;
}`
    );
    expect(result.result).toContain("dynamic import()");
    expect(result.result).toContain("node:buffer");
  });

  it("denies a dynamic import with a computed variable specifier", async () => {
    const result = await run(
      `const target = ["f", "s"].join("");
try {
  await import(target);
  return "LOADED";
} catch (e) {
  return e.message;
}`
    );
    expect(result.result).toContain("dynamic import()");
    expect(result.result).toContain("fs");
  });
});

// ---------------------------------------------------------------------------
// Hardening and unsupported kinds
// ---------------------------------------------------------------------------

describe("guest module hardening", () => {
  it("denies a module's top-level setTimeout", async () => {
    const timerPack = jsModule("@acme/timer", "@acme/nodetool-timer", [
      {
        id: "sandbox/timer.js",
        source: `setTimeout(() => {}, 0);
export const value = 1;`
      }
    ]);
    const result = await run(
      'import { value } from "@acme/timer";\nreturn value;',
      resolution([timerPack])
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("setTimeout");
  });

  it("denies a module's use of eval", async () => {
    const evilPack = jsModule("@acme/evil", "@acme/nodetool-evil", [
      {
        id: "sandbox/evil.js",
        source: 'export const value = eval("1 + 1");'
      }
    ]);
    const result = await run(
      'import { value } from "@acme/evil";\nreturn value;',
      resolution([evilPack])
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("eval");
  });

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
