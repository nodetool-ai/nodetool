/**
 * The optional-module fallback against a real `node_modules` holding an
 * ESM-only package — the shape of `@llamaindex/liteparse`, whose `exports`
 * has an `import` condition and no `require` one, so `require.resolve`
 * cannot see its entry.
 */
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  esmExportPath as esmExportPathOf,
  importOptionalModule,
  packageManifestSchema
} from "../src/optional-modules.js";

/** Parse a manifest the way the loader does, then resolve `subpath`. */
const esmExportPath = (manifest: object, subpath: string): string | null =>
  esmExportPathOf(packageManifestSchema.parse(manifest), subpath);

describe("esmExportPath", () => {
  it("picks the import condition of an ESM-only root export", () => {
    expect(
      esmExportPath(
        { exports: { ".": { types: "./lib.d.ts", import: "./dist/lib.js" } } },
        "."
      )
    ).toBe("./dist/lib.js");
  });

  it("follows condition order, so node wins over import when listed first", () => {
    const manifest = {
      exports: {
        "./node": {
          node: "./dist/index.node.cjs",
          import: "./dist/index.node.mjs"
        }
      }
    };
    expect(esmExportPath(manifest, "./node")).toBe("./dist/index.node.cjs");
  });

  it("reads a plain string or a conditions-only export as the root", () => {
    expect(esmExportPath({ exports: "./main.js" }, ".")).toBe("./main.js");
    expect(
      esmExportPath({ exports: { require: "./a.cjs", default: "./a.js" } }, ".")
    ).toBe("./a.js");
  });

  it("expands a subpath pattern", () => {
    expect(
      esmExportPath({ exports: { "./lib/*": { import: "./dist/*.js" } } }, "./lib/x")
    ).toBe("./dist/x.js");
  });

  it("answers null for a subpath the package does not export", () => {
    expect(esmExportPath({ exports: { ".": "./a.js" } }, "./hidden")).toBeNull();
    expect(esmExportPath({ exports: { ".": { require: "./a.cjs" } } }, ".")).toBeNull();
  });

  it("falls back to main without an exports field", () => {
    expect(esmExportPath({ main: "./index.cjs" }, ".")).toBe("./index.cjs");
    expect(esmExportPath({}, ".")).toBe("./index.js");
  });
});

describe("importOptionalModule from the optional node_modules", () => {
  let root: string;
  const saved = process.env["NODETOOL_OPTIONAL_NODE_MODULES"];

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "nodetool-optional-esm-"));
    const pkg = join(root, "node_modules", "@nt-test", "esm-only");
    await mkdir(join(pkg, "dist"), { recursive: true });
    await writeFile(
      join(pkg, "package.json"),
      JSON.stringify({
        name: "@nt-test/esm-only",
        type: "module",
        exports: { ".": { types: "./dist/lib.d.ts", import: "./dist/lib.js" } }
      })
    );
    await writeFile(join(pkg, "dist", "lib.js"), "export const marker = 42;\n");
    process.env["NODETOOL_OPTIONAL_NODE_MODULES"] = join(root, "node_modules");
  });

  afterAll(async () => {
    if (saved === undefined) {
      delete process.env["NODETOOL_OPTIONAL_NODE_MODULES"];
    } else {
      process.env["NODETOOL_OPTIONAL_NODE_MODULES"] = saved;
    }
    await rm(root, { recursive: true, force: true });
  });

  it("loads an ESM-only package that require.resolve cannot see", async () => {
    const mod = await importOptionalModule<{ marker: number }>(
      "@nt-test/esm-only"
    );
    expect(mod.marker).toBe(42);
  });

  it("still rejects a package that is not installed", async () => {
    await expect(importOptionalModule("@nt-test/absent")).rejects.toThrow();
  });
});
