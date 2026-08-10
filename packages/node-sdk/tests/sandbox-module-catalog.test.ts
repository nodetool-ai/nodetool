import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createSandboxModuleCatalog,
  discoverSandboxPack
} from "../src/index.js";

function createPack(): string {
  const dir = mkdtempSync(join(tmpdir(), "sandbox-catalog-"));
  mkdirSync(join(dir, "sandbox"));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "@acme/math",
      version: "1.2.3",
      nodetool: {
        sandboxModules: [{ name: ".", kind: "js", file: "sandbox/math.js" }]
      }
    })
  );
  writeFileSync(join(dir, "sandbox/math.js"), "export const add = (a, b) => a + b;");
  return dir;
}

describe("createSandboxModuleCatalog", () => {
  it("resolves a declared discovered module", () => {
    const dir = createPack();
    try {
      const discovery = discoverSandboxPack(dir);
      if (discovery === undefined) throw new Error("expected sandbox pack discovery");
      const module = discovery.modules[0];
      if (module === undefined) throw new Error("expected sandbox module");

      const catalog = createSandboxModuleCatalog([discovery]);
      const resolution = catalog.resolveForExecution([
        {
          specifier: "@acme/math",
          resolvedPackVersion: "1.2.3",
          contentDigest: module.digest
        }
      ]);

      expect(catalog.summaries()).toEqual([
        expect.objectContaining({
          specifier: "@acme/math",
          packName: "@acme/math",
          packVersion: "1.2.3",
          kind: "js"
        })
      ]);
      expect(resolution.modules).toEqual([
        expect.objectContaining({
          specifier: "@acme/math",
          packName: "@acme/math",
          packVersion: "1.2.3",
          contentDigest: module.digest,
          kind: "js"
        })
      ]);
      expect(resolution.statuses).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports unavailable modules and saved-version drift without blocking resolution", () => {
    const dir = createPack();
    try {
      const discovery = discoverSandboxPack(dir);
      if (discovery === undefined) throw new Error("expected sandbox pack discovery");

      const resolution = createSandboxModuleCatalog([discovery])
        .resolveForExecution([
          {
            specifier: "@acme/math",
            resolvedPackVersion: "1.0.0",
            contentDigest: "a".repeat(64)
          },
          { specifier: "@acme/missing" }
        ]);

      expect(resolution.modules).toHaveLength(1);
      expect(resolution.statuses).toEqual([
        expect.objectContaining({ code: "version-mismatch", status: "warning" }),
        expect.objectContaining({ code: "content-digest-mismatch", status: "warning" }),
        expect.objectContaining({ code: "module-not-found", status: "error" })
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("resolves each declared specifier only once", () => {
    const dir = createPack();
    try {
      const discovery = discoverSandboxPack(dir);
      if (discovery === undefined) throw new Error("expected sandbox pack discovery");

      const resolution = createSandboxModuleCatalog([discovery])
        .resolveForExecution([
          { specifier: "@acme/math" },
          { specifier: "@acme/math" },
          { specifier: "@acme/missing" },
          { specifier: "@acme/missing" }
        ]);

      expect(resolution.modules).toHaveLength(1);
      expect(resolution.statuses).toEqual([
        expect.objectContaining({ code: "module-not-found", status: "error" })
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns only the declared module's transitive graph", () => {
    const dir = mkdtempSync(join(tmpdir(), "sandbox-catalog-graph-"));
    try {
      mkdirSync(join(dir, "sandbox"));
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({
          name: "@acme/graph",
          nodetool: {
            sandboxModules: [
              { name: ".", kind: "js", file: "sandbox/root.js" },
              { name: "other", kind: "js", file: "sandbox/other.js" }
            ],
            internal: ["sandbox/helper.js"]
          }
        })
      );
      writeFileSync(join(dir, "sandbox/root.js"), "import { helper } from './helper.js'; export default helper;");
      writeFileSync(join(dir, "sandbox/helper.js"), "export const helper = 1;");
      writeFileSync(join(dir, "sandbox/other.js"), "export default 2;");
      const discovery = discoverSandboxPack(dir);
      if (discovery === undefined) throw new Error("expected sandbox pack discovery");

      const [resolved] = createSandboxModuleCatalog([discovery])
        .resolveForExecution([{ specifier: "@acme/graph" }]).modules;

      expect(resolved?.graph.map((file) => file.id)).toEqual([
        "sandbox/helper.js",
        "sandbox/root.js"
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
