/**
 * Tests for the guarded package-asset accessor.
 *
 * The resolver is the single choke point between two file layouts (dev
 * package resolution vs the flattened Electron bundle). What must hold:
 * unregistered refs fail loudly with the fix in the message, the
 * importer-relative fallback finds staged files, and failures name both
 * attempted locations.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  loadPackageAssetJson,
  resolvePackageAssetPath,
  getPackageAssetResolutions
} from "../src/package-assets.js";
import {
  PACKAGE_RUNTIME_ASSETS,
  findPackageAsset
} from "../src/package-asset-registry.js";

describe("package asset registry", () => {
  it("has unique basenames — the packaged layout is flat", () => {
    const basenames = PACKAGE_RUNTIME_ASSETS.map((a) =>
      a.path.split("/").pop()
    );
    expect(new Set(basenames).size).toBe(basenames.length);
  });

  it("finds entries by exact pkg and path", () => {
    expect(
      findPackageAsset("@nodetool-ai/kie-nodes", "kie-manifest.json")
    ).toBeDefined();
    expect(
      findPackageAsset("@nodetool-ai/kie-nodes", "other.json")
    ).toBeUndefined();
  });
});

describe("resolvePackageAssetPath", () => {
  let tempDir: string;
  let importerUrl: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "nodetool-package-assets-"));
    // Simulates the packaged layout: the importing module and the staged
    // asset sit in the same flat directory.
    writeFileSync(join(tempDir, "importer.mjs"), "");
    importerUrl = pathToFileURL(join(tempDir, "importer.mjs")).href;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("rejects unregistered assets with the registration fix", () => {
    expect(() =>
      resolvePackageAssetPath(
        { pkg: "@nodetool-ai/unknown", path: "unknown-manifest.json" },
        importerUrl
      )
    ).toThrow(/PACKAGE_RUNTIME_ASSETS/);
  });

  it("resolves a staged file next to the importer (flattened layout)", () => {
    const registry = [
      { pkg: "@nodetool-ai/fake", path: "sub/fake-manifest.json" }
    ];
    writeFileSync(join(tempDir, "fake-manifest.json"), '[{"id": 1}]');

    const resolved = resolvePackageAssetPath(
      { pkg: "@nodetool-ai/fake", path: "sub/fake-manifest.json" },
      importerUrl,
      registry
    );
    expect(resolved).toBe(join(tempDir, "fake-manifest.json"));
  });

  it("throws with both attempted locations when the file is nowhere", () => {
    const registry = [{ pkg: "@nodetool-ai/fake", path: "gone-manifest.json" }];
    expect(() =>
      resolvePackageAssetPath(
        { pkg: "@nodetool-ai/fake", path: "gone-manifest.json" },
        importerUrl,
        registry
      )
    ).toThrow(/@nodetool-ai\/fake\/gone-manifest\.json.*gone-manifest\.json/s);
  });

  it("records resolution outcomes for diagnostics", () => {
    const registry = [
      { pkg: "@nodetool-ai/fake", path: "diag-manifest.json" }
    ];
    writeFileSync(join(tempDir, "diag-manifest.json"), "[]");
    resolvePackageAssetPath(
      { pkg: "@nodetool-ai/fake", path: "diag-manifest.json" },
      importerUrl,
      registry
    );
    const entry = getPackageAssetResolutions().find(
      (r) => r.path === "diag-manifest.json"
    );
    expect(entry?.via).toBe("importer");
    expect(entry?.resolvedPath).toBe(join(tempDir, "diag-manifest.json"));
  });
});

describe("loadPackageAssetJson", () => {
  let tempDir: string;
  let importerUrl: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "nodetool-package-assets-"));
    writeFileSync(join(tempDir, "importer.mjs"), "");
    importerUrl = pathToFileURL(join(tempDir, "importer.mjs")).href;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("loads and parses a staged JSON asset", () => {
    const registry = [
      { pkg: "@nodetool-ai/fake", path: "json-manifest.json" }
    ];
    writeFileSync(
      join(tempDir, "json-manifest.json"),
      '[{"endpointId": "a/b"}]'
    );
    const data = loadPackageAssetJson<{ endpointId: string }[]>(
      { pkg: "@nodetool-ai/fake", path: "json-manifest.json" },
      importerUrl,
      registry
    );
    expect(data).toEqual([{ endpointId: "a/b" }]);
  });
});
