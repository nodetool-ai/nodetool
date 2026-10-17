/**
 * The example-workflow catalog the MCP mount and chat belt inject for
 * `get_example_workflow`. The example name is agent input and reaches a
 * filesystem join, so it must not be able to leave the examples directory.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExampleWorkflowCatalog } from "../src/mcp-tool-deps.js";

let root: string;
let examplesDir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nodetool-example-catalog-"));
  examplesDir = join(root, "examples", "nodetool-base");
  mkdirSync(examplesDir, { recursive: true });
  writeFileSync(
    join(examplesDir, "Hello.json"),
    JSON.stringify({ id: "hello", name: "Hello", graph: { nodes: [], edges: [] } })
  );
  // A JSON file outside the examples directory, e.g. a credentials file.
  writeFileSync(
    join(root, "secret.json"),
    JSON.stringify({ private_key: "do-not-leak" })
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("example workflow catalog get", () => {
  it("loads a shipped example by name", async () => {
    const catalog = createExampleWorkflowCatalog({ examplesDir });
    const example = await catalog.get("nodetool-base", "Hello");
    expect(example).toMatchObject({ id: "hello" });
  });

  it.each(["../../secret", "../../secret.json", "..\\..\\secret"])(
    "refuses %s, which names a file outside the examples directory",
    async (ref) => {
      const catalog = createExampleWorkflowCatalog({ examplesDir });
      const example = await catalog.get("nodetool-base", ref);
      expect(example).toBeNull();
    }
  );
});


describe("default workflow examples", () => {
  it("merges shipped examples with custom package metadata", async () => {
    const metadata = join(root, "nodetool", "package_metadata");
    mkdirSync(metadata, { recursive: true });
    writeFileSync(join(metadata, "custom.json"), JSON.stringify({
      name: "custom-examples",
      nodes: [],
      examples: [
        { id: "custom", name: "Unique review example", description: "A custom text example" },
        { id: "custom-2", name: "Unique review example", description: "Another custom text example" }
      ]
    }));
    const catalog = createExampleWorkflowCatalog({ metadataRoots: [root] });
    const examples = await catalog.list({});
    expect(examples).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "custom", name: "Unique review example", package_name: "custom-examples" }),
      expect.objectContaining({ id: "custom-2", name: "Unique review example", package_name: "custom-examples" })
    ]));
    expect(examples.some((example) => typeof example === "object" && example !== null &&
      "package_name" in example && example.package_name !== "custom-examples")).toBe(true);
  });
});
