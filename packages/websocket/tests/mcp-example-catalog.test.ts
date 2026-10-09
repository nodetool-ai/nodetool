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
