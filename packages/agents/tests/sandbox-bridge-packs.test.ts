/**
 * What the bridge packs (M6) must not change about the host.
 *
 * A pack is an added import path. `@nodetool-ai/sandbox-zip` puts fflate in the
 * guest, and the guest heap is not a decompression policy — so `data.unzip`'s
 * cap has to stay exactly where it was, and an uninstalled pack has to stay out
 * of the prompt tier a model reads.
 */
import { describe, it, expect } from "vitest";
import { MAX_UNZIP_TOTAL_BYTES } from "../src/js-sandbox.js";
import {
  mountActionModules,
  packagePromptLines,
  sessionAllowedPackages
} from "../src/codeact/sandbox-packages.js";
import { BRIDGE_PACKS } from "@nodetool-ai/node-sdk";
import type { SandboxModuleCatalog } from "@nodetool-ai/runtime";

const ZIP = "@nodetool-ai/sandbox-zip";

/** A catalog with nothing installed: no summary, no resolution. */
function emptyCatalog(): SandboxModuleCatalog {
  return {
    summaries: () => [],
    diagnostics: () => [],
    resolveForExecution: (declarations) => ({
      modules: [],
      statuses: declarations.map((declaration) => ({
        packName: declaration.specifier,
        specifier: declaration.specifier,
        status: "error" as const,
        code: "module-not-found",
        message: `Sandbox module ${declaration.specifier} is not installed.`
      }))
    })
  };
}

describe("the fflate bridge's zip-bomb cap", () => {
  it("is still 50 MB", () => {
    // Drift pin. `sandbox-zip` steers untrusted archives to `data.unzip`
    // precisely because this limit exists; moving it is a policy change, not a
    // refactor, and it belongs in its own commit with its own reasoning.
    expect(MAX_UNZIP_TOTAL_BYTES).toBe(50 * 1024 * 1024);
  });
});

describe("an uninstalled bridge pack in a CodeAct session", () => {
  it("gets no line in the one-liner tier", () => {
    const allowed = sessionAllowedPackages(undefined, true);
    expect(packagePromptLines(allowed, emptyCatalog())).toEqual([]);
    expect(allowed).not.toContain(ZIP);
  });

  it("is still absent when the catalog is asked directly", () => {
    expect(emptyCatalog().summaries().map((s) => s.specifier)).not.toContain(ZIP);
  });

  it("refuses an action that imports it anyway", () => {
    const mount = mountActionModules(
      `import { zipSync } from "${ZIP}";\nreturn zipSync({});`,
      [],
      emptyCatalog()
    );
    expect(mount.ok).toBe(false);
    if (mount.ok) return;
    expect(mount.error).toContain(ZIP);
    expect(mount.error).toContain("allowlist");
  });

  it("is refused by the catalog even once a session allows the specifier", () => {
    const mount = mountActionModules(
      `import { zipSync } from "${ZIP}";\nreturn zipSync({});`,
      [ZIP],
      emptyCatalog()
    );
    expect(mount.ok).toBe(false);
  });
});

describe("the shipped bridge-pack table", () => {
  it("names every pack by its own package name", () => {
    for (const pack of BRIDGE_PACKS) {
      expect(pack.specifier).toBe(pack.packName);
      expect(pack.specifier.startsWith("@nodetool-ai/sandbox-")).toBe(true);
    }
  });
});
