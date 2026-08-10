/**
 * Discovery's side of the npm contract: it stays synchronous and engine-free,
 * and everything a compiler concluded arrives through the injected lookup.
 *
 * No esbuild and no QuickJS here on purpose — that is the seam being tested.
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  computeSandboxModuleGraphDigest,
  discoverSandboxPack,
  isNpmModuleId,
  npmModuleId,
  SANDBOX_PACKAGE_LIMITS,
  type SandboxCompiledNpmLookup
} from "../src/index.js";

const COMPILED = "export const value = 1;\n";

function npmPack(npmName = "left-pad"): string {
  const dir = mkdtempSync(join(tmpdir(), "sandbox-npm-pack-"));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "@acme/npm-pack",
      version: "1.0.0",
      nodetool: {
        apiVersion: 1,
        sandboxModules: [{ name: ".", kind: "js", npm: npmName }]
      }
    })
  );
  writeFileSync(join(dir, "SKILL.md"), "---\nname: npm-pack\n---\n");
  return dir;
}

const compiledLookup = (
  source = COMPILED,
  warnings?: readonly string[]
): SandboxCompiledNpmLookup => () => ({
  status: "compiled",
  artifact: {
    source,
    compilerVersion: "1",
    optionsDigest: "a".repeat(64),
    inputsDigest: "b".repeat(64)
  },
  ...(warnings === undefined ? {} : { warnings })
});

describe("npm module discovery", () => {
  it("reports pending-compile without a lookup", () => {
    const discovery = discoverSandboxPack(npmPack());
    const status = discovery?.statuses.find((entry) => entry.code === "pending-compile");
    expect(status?.status).toBe("skipped");
    expect(status?.message).toContain("nodetool packs compile");
    expect(discovery?.modules[0]?.source).toBeUndefined();
    expect(discovery?.graph.some((file) => isNpmModuleId(file.id))).toBe(false);
  });

  it("takes a compiled artifact as a graph file", () => {
    const discovery = discoverSandboxPack(npmPack(), { compiled: compiledLookup() });
    expect(discovery?.modules[0]?.source).toBe(COMPILED);
    expect(discovery?.modules[0]?.dependencies).toEqual([]);
    const file = discovery?.graph.find((entry) => entry.id === npmModuleId("left-pad"));
    expect(file?.kind).toBe("js");
    expect(file?.source).toBe(COMPILED);
    expect(file?.internal).toBe(false);
    expect(discovery?.statuses.some((entry) => entry.code === "npm-module-compiled")).toBe(true);
  });

  it("passes a compiler's skip through by its own code", () => {
    const discovery = discoverSandboxPack(npmPack(), {
      compiled: () => ({
        status: "skipped",
        code: "npm-module-builtin-import",
        message: "left-pad imports node:fs"
      })
    });
    const status = discovery?.statuses.find((entry) => entry.code === "npm-module-builtin-import");
    expect(status?.status).toBe("skipped");
    expect(discovery?.modules[0]?.source).toBeUndefined();
  });

  it("records a compiler warning as a warning, not a skip", () => {
    const discovery = discoverSandboxPack(npmPack(), {
      compiled: compiledLookup(COMPILED, ["left-pad feature-detects process"])
    });
    const warning = discovery?.statuses.find((entry) => entry.code === "npm-module-warning");
    expect(warning?.status).toBe("warning");
    expect(discovery?.modules[0]?.source).toBe(COMPILED);
  });

  it("refuses an artifact past the byte cap without failing the pack", () => {
    const oversized = `export const filler = "${"x".repeat(SANDBOX_PACKAGE_LIMITS.npmBundledJsBytes)}";`;
    const discovery = discoverSandboxPack(npmPack(), { compiled: compiledLookup(oversized) });
    const status = discovery?.statuses.find((entry) => entry.code === "npm-module-too-large");
    expect(status?.status).toBe("skipped");
    expect(discovery?.modules[0]?.source).toBeUndefined();
  });

  it("digests the bundled source, the compiler version, and its options", () => {
    const dir = npmPack();
    const base = discoverSandboxPack(dir, { compiled: compiledLookup() });
    const otherSource = discoverSandboxPack(dir, { compiled: compiledLookup("export const value = 2;\n") });
    const otherOptions = discoverSandboxPack(dir, {
      compiled: () => ({
        status: "compiled",
        artifact: {
          source: COMPILED,
          compilerVersion: "1",
          optionsDigest: "c".repeat(64),
          inputsDigest: "b".repeat(64)
        }
      })
    });
    const otherCompiler = discoverSandboxPack(dir, {
      compiled: () => ({
        status: "compiled",
        artifact: {
          source: COMPILED,
          compilerVersion: "2",
          optionsDigest: "a".repeat(64),
          inputsDigest: "b".repeat(64)
        }
      })
    });

    expect(base?.modules[0]?.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(otherSource?.modules[0]?.digest).not.toBe(base?.modules[0]?.digest);
    expect(otherOptions?.modules[0]?.digest).not.toBe(base?.modules[0]?.digest);
    expect(otherCompiler?.modules[0]?.digest).not.toBe(base?.modules[0]?.digest);
    expect(otherCompiler?.digest).not.toBe(base?.digest);
  });

  it("is stable across repeated discovery of the same artifact", () => {
    const dir = npmPack();
    const first = discoverSandboxPack(dir, { compiled: compiledLookup() });
    const second = discoverSandboxPack(dir, { compiled: compiledLookup() });
    expect(second?.digest).toBe(first?.digest);
    expect(second?.modules[0]?.digest).toBe(first?.modules[0]?.digest);
  });

  it("hands the lookup the pack it is asking about", () => {
    const dir = npmPack("js-yaml");
    const seen: unknown[] = [];
    discoverSandboxPack(dir, {
      compiled: (request) => {
        seen.push(request);
        return undefined;
      }
    });
    expect(seen).toEqual([
      { packName: "@acme/npm-pack", packDir: expect.any(String), specifier: "@acme/npm-pack", npmName: "js-yaml" }
    ]);
  });

  it("folds compiler identity into the exported graph digest helper", () => {
    const discovery = discoverSandboxPack(npmPack(), { compiled: compiledLookup() });
    if (discovery === undefined) throw new Error("pack not discovered");
    const files = new Map(
      discovery.graph.map((file) => [file.id, { bytes: new TextEncoder().encode(file.source ?? ""), kind: file.kind }])
    );
    const withArtifact = computeSandboxModuleGraphDigest(discovery.modules, files, new Set(), {
      packageName: discovery.name,
      npmArtifacts: new Map([
        [npmModuleId("left-pad"), { source: COMPILED, compilerVersion: "1", optionsDigest: "a".repeat(64), inputsDigest: "b".repeat(64) }]
      ])
    });
    const withoutArtifact = computeSandboxModuleGraphDigest(discovery.modules, files, new Set(), {
      packageName: discovery.name
    });
    expect(withArtifact).not.toBe(withoutArtifact);
  });
});
