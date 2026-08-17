import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  discoverSandboxPack,
  discoverSandboxPacks,
  normalizeSandboxSpecifier,
  SANDBOX_PACKAGE_LIMITS,
  SandboxPackDiscoveryError
} from "../src/index.js";
import { SandboxModuleDeclarationSchema, SandboxPackManifestSchema } from "@nodetool-ai/protocol";

function pack(manifest: Record<string, unknown>, files: Record<string, string | Uint8Array>): string {
  const dir = mkdtempSync(join(tmpdir(), "sandbox-pack-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "@acme/test-pack", version: "1.0.0", nodetool: manifest }));
  for (const [name, content] of Object.entries(files)) {
    const file = join(dir, name);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, content);
  }
  return dir;
}

function jsManifest(file = "sandbox/index.js", internal: string[] = []) {
  return { apiVersion: 1, sandboxModules: [{ name: ".", kind: "js", file }], internal };
}

function expectDiscoveryError(fn: () => unknown, text: string): void {
  expect(fn).toThrowError(new RegExp(text));
}

const scalarWasm = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0,
  1, 6, 1, 96, 1, 127, 1, 127,
  3, 2, 1, 0,
  7, 7, 1, 3, 114, 117, 110, 0, 0,
  10, 6, 1, 4, 0, 32, 0, 11
]);

function wasmWithMemory(flags: number, maximum?: number): Uint8Array {
  const memory = maximum === undefined ? [1, flags, 1] : [1, flags, 1, maximum];
  return new Uint8Array([...scalarWasm.slice(0, 20), 5, memory.length, ...memory, ...scalarWasm.slice(20)]);
}

const wasmWithImport = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0,
  1, 6, 1, 96, 1, 127, 1, 127,
  2, 9, 1, 3, 101, 110, 118, 1, 102, 0, 0
]);

const wasmWithI64 = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0,
  1, 6, 1, 96, 1, 126, 1, 126,
  3, 2, 1, 0,
  7, 7, 1, 3, 114, 117, 110, 0, 0,
  10, 6, 1, 4, 0, 32, 0, 11
]);

describe("sandbox package discovery", () => {
  it("normalizes root and one-segment module specifiers", () => {
    expect(normalizeSandboxSpecifier("@acme/geo", ".")).toBe("@acme/geo");
    expect(normalizeSandboxSpecifier("@acme/geo", "extra")).toBe("@acme/geo/extra");
    expect(() => normalizeSandboxSpecifier("@acme/geo", "nested/path")).toThrow();
  });

  it("accepts sandbox metadata alongside existing nodetool fields", () => {
    const dir = mkdtempSync(join(tmpdir(), "sandbox-pack-extra-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "@acme/test-pack", nodetool: { register: "./register.js", nodes: ["x"], sandboxModules: [{ name: ".", kind: "js", file: "index.js" }] } }));
    writeFileSync(join(dir, "index.js"), "export default 1");
    expect(discoverSandboxPack(dir)?.name).toBe("@acme/test-pack");
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects duplicate module names at the manifest boundary", () => {
    const dir = pack({ sandboxModules: [
      { name: ".", kind: "js", file: "a.js" },
      { name: ".", kind: "js", file: "b.js" }
    ] }, { "a.js": "export default 1", "b.js": "export default 2" });
    expectDiscoveryError(() => discoverSandboxPack(dir), "duplicate module name");
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects public files that collide after path normalization", () => {
    const dir = pack({ sandboxModules: [
      { name: ".", kind: "js", file: "sandbox/./index.js" },
      { name: "extra", kind: "js", file: "sandbox/index.js" }
    ] }, { "sandbox/index.js": "export default 1" });
    expectDiscoveryError(() => discoverSandboxPack(dir), "duplicate sandbox file");
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects path escapes and symlinked files", () => {
    const dir = pack(jsManifest("../outside.js"), { "sandbox/index.js": "export default 1" });
    expectDiscoveryError(() => discoverSandboxPack(dir), "package-relative path");
    rmSync(dir, { recursive: true, force: true });

    const linked = pack(jsManifest(), { "outside.js": "export default 1" });
    symlinkSync(join(linked, "outside.js"), join(linked, "sandbox.js"));
    writeFileSync(join(linked, "package.json"), JSON.stringify({ name: "@acme/test-pack", nodetool: jsManifest("sandbox.js") }));
    expectDiscoveryError(() => discoverSandboxPack(linked), "symlinks");
    rmSync(linked, { recursive: true, force: true });
  });

  it("enforces JS, WASM, and pack size caps", () => {
    const oversizedJs = pack(jsManifest(), { "sandbox/index.js": "x".repeat(SANDBOX_PACKAGE_LIMITS.authoredJsBytes + 1) });
    expectDiscoveryError(() => discoverSandboxPack(oversizedJs), "js module cap");
    rmSync(oversizedJs, { recursive: true, force: true });

    const oversizedWasm = pack({ sandboxModules: [{ name: "x", kind: "wasm", file: "x.wasm", memoryPagesMax: 1, exports: ["run"] }] }, { "x.wasm": new Uint8Array(SANDBOX_PACKAGE_LIMITS.wasmBytes + 1) });
    expectDiscoveryError(() => discoverSandboxPack(oversizedWasm), "wasm module cap");
    rmSync(oversizedWasm, { recursive: true, force: true });

    const largeSource = `export const value = 1;\n${" ".repeat(SANDBOX_PACKAGE_LIMITS.authoredJsBytes - 24)}`;
    const internal = Array.from({ length: 32 }, (_, index) => `sandbox/internal-${index}.js`);
    const oversizedPack = pack({ sandboxModules: [{ name: ".", kind: "js", file: "sandbox/index.js" }], internal }, {
      "sandbox/index.js": largeSource,
      ...Object.fromEntries(internal.map((file) => [file, largeSource]))
    });
    expectDiscoveryError(() => discoverSandboxPack(oversizedPack), "pack cap");
    rmSync(oversizedPack, { recursive: true, force: true });
  });

  it("rejects dynamic imports, require, and imports outside the pack", () => {
    for (const source of [
      "export default import('./other.js')",
      "export default require('./other.js')",
      "import x from 'node:buffer'; export default x",
      "import x from '../outside.js'; export default x"
    ]) {
      const dir = pack(jsManifest(), { "sandbox/index.js": source, "other.js": "export default 1" });
      expect(() => discoverSandboxPack(dir)).toThrow();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts capability-module imports in authored pack code", () => {
    const dir = pack(jsManifest(), {
      "sandbox/index.js":
        "import { invoke_node } from '@nodetool-ai/sandbox-nodetool/flow';\nexport const call = (args) => invoke_node(args);"
    });
    expect(discoverSandboxPack(dir)?.name).toBe("@acme/test-pack");
    rmSync(dir, { recursive: true, force: true });

    const lookalike = pack(jsManifest(), {
      "sandbox/index.js": "import x from '@nodetool-ai/sandbox-nodetool-fake'; export default x"
    });
    expectDiscoveryError(() => discoverSandboxPack(lookalike), "import outside the pack");
    rmSync(lookalike, { recursive: true, force: true });
  });

  it("validates WASM imports, memories, signatures, and declared exports", () => {
    const valid = pack({ apiVersion: 1, sandboxModules: [{ name: "math", kind: "wasm", file: "math.wasm", memoryPagesMax: 4, exports: ["run"] }] }, { "math.wasm": scalarWasm });
    const discovery = discoverSandboxPack(valid);
    expect(discovery?.modules[0]?.kind).toBe("wasm");
    expect(discovery?.graph[0]?.bytes).toBeDefined();
    rmSync(valid, { recursive: true, force: true });

    for (const [bytes, message] of [[wasmWithImport, "imports"], [wasmWithI64, "uses i64"], [wasmWithMemory(0), "maximum"]] as const) {
      const dir = pack({ apiVersion: 1, sandboxModules: [{ name: "math", kind: "wasm", file: "math.wasm", memoryPagesMax: 4, exports: ["run"] }] }, { "math.wasm": bytes });
      expectDiscoveryError(() => discoverSandboxPack(dir), message);
      rmSync(dir, { recursive: true, force: true });
    }

    const oversizedMemory = pack({ apiVersion: 1, sandboxModules: [{ name: "math", kind: "wasm", file: "math.wasm", memoryPagesMax: 1, exports: ["run"] }] }, { "math.wasm": wasmWithMemory(1, 2) });
    expectDiscoveryError(() => discoverSandboxPack(oversizedMemory), "memory maximum");
    rmSync(oversizedMemory, { recursive: true, force: true });
  });

  it("validates manifest API, npm names, declarations, and export aliases", () => {
    expect(() => SandboxPackManifestSchema.parse({ apiVersion: 2, sandboxModules: [] })).toThrow();
    expect(() => SandboxPackManifestSchema.parse({ apiVersion: 1, sandboxModules: [{ name: ".", kind: "js", npm: "../bad" }] })).toThrow();
    expect(() => SandboxPackManifestSchema.parse({ apiVersion: 1, sandboxModules: [{ name: ".", kind: "wasm", file: "x.wasm", memoryPagesMax: 1, exports: [{ wasm: "run", as: "await" }] }] })).toThrow();
    expect(() => SandboxModuleDeclarationSchema.parse({ specifier: "node:buffer" })).toThrow();
    expect(() => SandboxModuleDeclarationSchema.parse({ specifier: "@acme/pack/nested/path" })).toThrow();
  });

  it("returns named errors for missing files and exposes declared transitive graph files", () => {
    const missing = pack(jsManifest("sandbox/missing.js"), {});
    expect(() => discoverSandboxPack(missing)).toThrow(SandboxPackDiscoveryError);
    rmSync(missing, { recursive: true, force: true });
    const dir = pack(jsManifest("sandbox/index.js", ["sandbox/helper.js"]), { "sandbox/index.js": "import { helper } from './helper.js'; export default helper", "sandbox/helper.js": "export const helper = 1" });
    expect(discoverSandboxPack(dir)?.graph.map((file) => file.id)).toEqual(["sandbox/helper.js", "sandbox/index.js"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects imports of helpers omitted from the manifest internal list", () => {
    const dir = pack(jsManifest(), {
      "sandbox/index.js": "import { helper } from './helper.js'; export default helper",
      "sandbox/helper.js": "export const helper = 1"
    });
    expectDiscoveryError(() => discoverSandboxPack(dir), "not declared as a public or internal file");
    rmSync(dir, { recursive: true, force: true });
  });

  it("validates internal files and rejects internal cycles", () => {
    const dir = pack(jsManifest("sandbox/index.js", ["sandbox/a.js", "sandbox/b.js"]), {
      "sandbox/index.js": "import { a } from './a.js'; export default a",
      "sandbox/a.js": "import { b } from './b.js'; export const a = b",
      "sandbox/b.js": "import { a } from './a.js'; export const b = a"
    });
    expectDiscoveryError(() => discoverSandboxPack(dir), "cycle");
    rmSync(dir, { recursive: true, force: true });
  });

  it("treats missing, malformed, unavailable, and oversized SKILL.md as warnings", () => {
    const missing = pack(jsManifest(), { "sandbox/index.js": "export default 1" });
    expect(discoverSandboxPack(missing)?.statuses).toEqual([expect.objectContaining({ code: "skill-missing", status: "warning" })]);
    rmSync(missing, { recursive: true, force: true });

    const invalid = pack(jsManifest(), { "sandbox/index.js": "export default 1", "SKILL.md": "not frontmatter" });
    expect(discoverSandboxPack(invalid)?.statuses).toEqual([expect.objectContaining({ code: "skill-invalid", status: "warning" })]);
    rmSync(invalid, { recursive: true, force: true });

    const linked = pack(jsManifest(), { "sandbox/index.js": "export default 1", "outside.md": "---\ntitle: Test\n---\n" });
    symlinkSync(join(linked, "outside.md"), join(linked, "SKILL.md"));
    expect(discoverSandboxPack(linked)?.statuses).toEqual([expect.objectContaining({ code: "skill-invalid", status: "warning" })]);
    rmSync(linked, { recursive: true, force: true });

    const oversized = pack(jsManifest(), {
      "sandbox/index.js": "export default 1",
      "SKILL.md": "x".repeat(SANDBOX_PACKAGE_LIMITS.skillBytes + 1)
    });
    expect(discoverSandboxPack(oversized)?.statuses).toEqual([expect.objectContaining({ code: "skill-invalid", status: "warning" })]);
    rmSync(oversized, { recursive: true, force: true });
  });

  it("computes a stable graph digest independent of manifest ordering", () => {
    const files = {
      "sandbox/index.js": "import { helper } from './helper.js'; export default helper",
      "sandbox/helper.js": "export const helper = 1",
      "SKILL.md": "---\ntitle: Test\n---\n"
    };
    const first = pack({ sandboxModules: [
      { name: ".", kind: "js", file: "sandbox/index.js" },
      { name: "helper", kind: "js", file: "sandbox/helper.js" }
    ] }, files);
    const second = pack({ sandboxModules: [
      { name: "helper", kind: "js", file: "sandbox/helper.js" },
      { name: ".", kind: "js", file: "sandbox/index.js" }
    ] }, files);
    expect(discoverSandboxPack(first)?.digest).toBe(discoverSandboxPack(second)?.digest);
    expect(existsSync(join(first, "SKILL.md"))).toBe(true);
    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
  });

  it("computes a digest from each public module's transitive graph", () => {
    const manifest = {
      sandboxModules: [
        { name: ".", kind: "js", file: "sandbox/root.js" },
        { name: "other", kind: "js", file: "sandbox/other.js" }
      ],
      internal: ["sandbox/helper.js"]
    };
    const baseFiles = {
      "sandbox/root.js": "import { helper } from './helper.js'; export default helper",
      "sandbox/helper.js": "export const helper = 1",
      "sandbox/other.js": "export default 1"
    };
    const first = pack(manifest, baseFiles);
    const second = pack(manifest, { ...baseFiles, "sandbox/other.js": "export default 2" });
    try {
      const firstModules = discoverSandboxPack(first)?.modules;
      const secondModules = discoverSandboxPack(second)?.modules;
      const firstRoot = firstModules?.find((module) => module.specifier === "@acme/test-pack");
      const secondRoot = secondModules?.find((module) => module.specifier === "@acme/test-pack");
      const firstOther = firstModules?.find((module) => module.specifier === "@acme/test-pack/other");
      const secondOther = secondModules?.find((module) => module.specifier === "@acme/test-pack/other");

      expect(firstRoot?.digest).toBe(secondRoot?.digest);
      expect(firstOther?.digest).not.toBe(secondOther?.digest);
    } finally {
      rmSync(first, { recursive: true, force: true });
      rmSync(second, { recursive: true, force: true });
    }
  });

  it("includes each WASM module's declared ABI and memory limit in its digest", () => {
    const first = pack({ sandboxModules: [{ name: "math", kind: "wasm", file: "math.wasm", memoryPagesMax: 1, exports: ["run"] }] }, { "math.wasm": scalarWasm });
    const second = pack({ sandboxModules: [{ name: "math", kind: "wasm", file: "math.wasm", memoryPagesMax: 2, exports: [{ wasm: "run", as: "calculate" }] }] }, { "math.wasm": scalarWasm });
    try {
      expect(discoverSandboxPack(first)?.modules[0]?.digest)
        .not.toBe(discoverSandboxPack(second)?.modules[0]?.digest);
    } finally {
      rmSync(first, { recursive: true, force: true });
      rmSync(second, { recursive: true, force: true });
    }
  });

  it("rejects duplicate package names across discovery roots", () => {
    const first = pack(jsManifest(), { "sandbox/index.js": "export default 1" });
    const second = pack(jsManifest(), { "sandbox/index.js": "export default 2" });
    try {
      expectDiscoveryError(
        () => discoverSandboxPacks([first, second]),
        "duplicate sandbox package"
      );
    } finally {
      rmSync(first, { recursive: true, force: true });
      rmSync(second, { recursive: true, force: true });
    }
  });
});
