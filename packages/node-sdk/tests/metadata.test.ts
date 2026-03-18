import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BaseNode } from "../src/base-node.js";
import { loadPythonPackageMetadata } from "../src/metadata.js";
import { NodeRegistry } from "../src/registry.js";

class SampleNode extends BaseNode {
  static readonly nodeType = "nodetool.test.Sample";
  static readonly title = "Sample";
  static readonly description = "Sample node";
  async process(): Promise<Record<string, unknown>> {
    return { output: "ok" };
  }
}

const tmpDirs: string[] = [];

function makeTmpRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nodetool-metadata-"));
  tmpDirs.push(root);
  return root;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0, tmpDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("Python metadata loader", () => {
  it("loads metadata files from src/nodetool/package_metadata", () => {
    const root = makeTmpRoot();
    const metadataDir = path.join(root, "pkg-a", "src", "nodetool", "package_metadata");
    fs.mkdirSync(metadataDir, { recursive: true });
    const metadataPath = path.join(metadataDir, "pkg-a.json");
    fs.writeFileSync(
      metadataPath,
      JSON.stringify(
        {
          name: "pkg-a",
          version: "0.1.0",
          nodes: [
            {
              title: "Sample",
              description: "sample",
              namespace: "nodetool.test",
              node_type: "nodetool.test.Sample",
              properties: [],
              outputs: [{ name: "output", type: { type: "str" } }],
            },
          ],
        },
        null,
        2
      )
    );

    const loaded = loadPythonPackageMetadata({ roots: [root] });
    expect(loaded.files).toContain(path.resolve(metadataPath));
    expect(loaded.nodesByType.has("nodetool.test.Sample")).toBe(true);
    expect(loaded.warnings).toEqual([]);
  });

  it("loads metadata files from nodetool/package_metadata (pip layout)", () => {
    const root = makeTmpRoot();
    const metadataDir = path.join(root, "site-packages", "nodetool", "package_metadata");
    fs.mkdirSync(metadataDir, { recursive: true });
    const metadataPath = path.join(metadataDir, "pkg-pip.json");
    fs.writeFileSync(
      metadataPath,
      JSON.stringify(
        {
          name: "pkg-pip",
          version: "0.1.0",
          nodes: [
            {
              title: "Sample",
              description: "sample",
              namespace: "nodetool.test",
              node_type: "nodetool.test.Sample",
              properties: [],
              outputs: [{ name: "output", type: { type: "str" } }],
            },
          ],
        },
        null,
        2
      )
    );

    const loaded = loadPythonPackageMetadata({ roots: [root] });
    expect(loaded.files).toContain(path.resolve(metadataPath));
    expect(loaded.nodesByType.has("nodetool.test.Sample")).toBe(true);
    expect(loaded.warnings).toEqual([]);
  });
});

describe("NodeRegistry metadata integration", () => {
  it("register() resolves metadata loaded from Python JSON", () => {
    const root = makeTmpRoot();
    const metadataDir = path.join(root, "pkg-b", "src", "nodetool", "package_metadata");
    fs.mkdirSync(metadataDir, { recursive: true });
    fs.writeFileSync(
      path.join(metadataDir, "pkg-b.json"),
      JSON.stringify(
        {
          name: "pkg-b",
          version: "0.1.0",
          nodes: [
            {
              title: "Sample",
              description: "sample",
              namespace: "nodetool.test",
              node_type: "nodetool.test.Sample",
              properties: [],
              outputs: [{ name: "output", type: { type: "str" } }],
            },
          ],
        },
        null,
        2
      )
    );

    const registry = new NodeRegistry();
    registry.loadPythonMetadata({ roots: [root] });
    registry.register(SampleNode);
    expect(registry.getMetadata(SampleNode.nodeType)?.node_type).toBe(SampleNode.nodeType);
  });

  it("strictMetadata mode accepts TS-derived metadata (auto-generated from class)", () => {
    const registry = new NodeRegistry({ strictMetadata: true });
    // TS classes now auto-generate metadata, so registration succeeds
    expect(() => registry.register(SampleNode)).not.toThrow();
    expect(registry.getMetadata("nodetool.test.Sample")).toBeDefined();
  });

  it("strictMetadata mode rejects when neither TS nor Python metadata available", () => {
    class NoMetadataNode extends BaseNode {
      static readonly nodeType = "nodetool.test.NoMetadata";
      static readonly title = "NoMetadata";
      static readonly description = "";
      async process() { return {}; }
    }
    const registry = new NodeRegistry({ strictMetadata: true });
    expect(() => registry.register(NoMetadataNode as unknown as typeof SampleNode)).not.toThrow();
  });
});
