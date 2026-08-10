/**
 * Presence rules for the shipped library packs.
 *
 * Every library the sandbox offers is now an importable pack, so "installed"
 * is load-bearing in a way it was not while `data.*` existed: a pack nobody
 * installed must stay out of the prompt tier a model reads, and an action that
 * imports it anyway must be refused by name rather than resolve to nothing.
 */
import { describe, it, expect } from "vitest";
import { SANDBOX_HOST_MODULES } from "@nodetool-ai/protocol";
import {
  mountActionModules,
  packagePromptLines,
  sessionAllowedPackages
} from "../src/codeact/sandbox-packages.js";
import { BRIDGE_PACKS, bridgePackFor, installHintFor } from "@nodetool-ai/node-sdk";
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

describe("an uninstalled pack in a CodeAct session", () => {
  it("gets no line in the one-liner tier", () => {
    const allowed = sessionAllowedPackages(undefined);
    expect(packagePromptLines(allowed, emptyCatalog())).toEqual([]);
    expect(allowed).not.toContain(ZIP);
  });

  it("is still absent when the catalog is asked directly", () => {
    expect(emptyCatalog().summaries().map((s) => s.specifier)).not.toContain(ZIP);
  });

  it("refuses an action that imports it anyway", () => {
    const mount = mountActionModules(
      `import { unzip } from "${ZIP}";\nreturn unzip(new Uint8Array());`,
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
      `import { unzip } from "${ZIP}";\nreturn unzip(new Uint8Array());`,
      [ZIP],
      emptyCatalog()
    );
    expect(mount.ok).toBe(false);
  });
});

describe("the shipped pack table", () => {
  it("names every pack by its own package name", () => {
    for (const pack of BRIDGE_PACKS) {
      expect(pack.specifier).toBe(pack.packName);
      expect(pack.specifier.startsWith("@nodetool-ai/sandbox-")).toBe(true);
    }
  });

  it("covers every host module the protocol registry declares", () => {
    // A host module whose pack is missing from this table is a specifier that
    // resolves for nobody and hints at nothing.
    for (const spec of Object.values(SANDBOX_HOST_MODULES)) {
      const pack = bridgePackFor(spec.packName);
      expect(pack, `no pack row for host module ${spec.id}`).toBeDefined();
      expect(pack?.runs).toBe("host");
    }
  });

  it("hints an install for a shipped specifier and stays silent otherwise", () => {
    expect(installHintFor(ZIP)).toContain(ZIP);
    expect(installHintFor("@acme/whatever")).toBeUndefined();
  });
});
