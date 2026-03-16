import path from "node:path";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { NodeRegistry } from "@nodetool/node-sdk";
import { registerBaseNodes } from "../src/index.js";

function workspaceRootFromTestsDir(): string {
  return path.resolve(__dirname, "../../../../..");
}

describe("lib namespace migration coverage", () => {
  it("registers all nodetool-base lib.* node types", () => {
    const registry = new NodeRegistry();
    registry.loadPythonMetadata({
      roots: [workspaceRootFromTestsDir()],
      maxDepth: 7,
    });
    registerBaseNodes(registry);

    const metadataPath = path.resolve(
      workspaceRootFromTestsDir(),
      "nodetool-base/src/nodetool/package_metadata/nodetool-base.json"
    );
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as {
      nodes?: Array<{ node_type?: string }>;
    };
    const libNodeTypes = (metadata.nodes ?? [])
      .map((n) => n.node_type)
      .filter((t): t is string => typeof t === "string" && t.startsWith("lib."));
    const missing = libNodeTypes.filter((t) => !registry.has(t));
    expect(missing).toEqual([]);
  });
});
