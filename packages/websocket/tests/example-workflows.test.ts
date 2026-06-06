import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  loadExampleGraph,
  resolveExampleJsonPath,
  defaultExamplePackageName,
  deriveExampleAssetsDir
} from "../src/example-workflows.js";

function writeExample(
  dir: string,
  fileName: string,
  data: Record<string, unknown>
): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), JSON.stringify(data), "utf8");
}

describe("example-workflows", () => {
  it("resolves examples by filename", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nt-examples-"));
    const examplesDir = path.join(root, "examples", "nodetool-base");
    writeExample(examplesDir, "hello-world.json", {
      name: "Hello World",
      graph: { nodes: [{ id: "n1" }], edges: [] }
    });

    const resolved = resolveExampleJsonPath(examplesDir, "hello-world");
    expect(resolved).toBe(path.join(examplesDir, "hello-world.json"));
  });

  it("resolves examples by display name", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nt-examples-"));
    const examplesDir = path.join(root, "examples", "nodetool-base");
    writeExample(examplesDir, "movie_posters.json", {
      name: "Movie Posters",
      graph: { nodes: [{ id: "n1" }], edges: [] }
    });

    const resolved = resolveExampleJsonPath(examplesDir, "Movie Posters");
    expect(resolved).toBe(path.join(examplesDir, "movie_posters.json"));
  });

  it("loads graph data from configured examplesDir", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nt-examples-"));
    const examplesDir = path.join(root, "examples", "nodetool-base");
    writeExample(examplesDir, "demo.json", {
      name: "Demo",
      graph: {
        nodes: [{ id: "node-1", type: "nodetool.constant.String" }],
        edges: []
      }
    });

    const loaded = loadExampleGraph("nodetool-base", "demo", { examplesDir });
    expect(loaded?.graph).toEqual({
      nodes: [{ id: "node-1", type: "nodetool.constant.String" }],
      edges: []
    });
  });

  it("defaults package name from examplesDir basename", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nt-examples-"));
    const examplesDir = path.join(root, "examples", "nodetool-base");
    fs.mkdirSync(examplesDir, { recursive: true });
    expect(defaultExamplePackageName({ examplesDir })).toBe("nodetool-base");
  });

  it("falls back to bundled assets when examples are mounted elsewhere", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nt-examples-"));
    const examplesDir = path.join(root, "workspace", "examples", "nodetool-base");
    const bundledAssets = path.join(root, "bundled", "assets", "nodetool-base");
    fs.mkdirSync(examplesDir, { recursive: true });
    fs.mkdirSync(bundledAssets, { recursive: true });
    writeExample(examplesDir, "demo.json", { name: "Demo" });
    fs.writeFileSync(path.join(bundledAssets, "Demo.jpg"), "fake-jpg", "utf8");

    const resolved = deriveExampleAssetsDir(examplesDir, bundledAssets);
    expect(resolved).toBe(bundledAssets);
    expect(fs.existsSync(path.join(resolved, "Demo.jpg"))).toBe(true);
  });
});
