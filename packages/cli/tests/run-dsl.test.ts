import { describe, test, expect } from "vitest";
import { isWorkflow, runDslFile } from "../src/run-dsl.js";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => resolve(__dirname, "fixtures", name);

describe("isWorkflow", () => {
  test("returns true for objects with nodes/edges arrays", () => {
    expect(isWorkflow({ nodes: [], edges: [] })).toBe(true);
    expect(isWorkflow({ nodes: [{}], edges: [{}] })).toBe(true);
  });

  test("returns false for non-workflow values", () => {
    expect(isWorkflow(null)).toBe(false);
    expect(isWorkflow(42)).toBe(false);
    expect(isWorkflow({ nodes: [] })).toBe(false); // missing edges
    expect(isWorkflow({ edges: [] })).toBe(false); // missing nodes
    expect(isWorkflow({ nodes: "not-array", edges: [] })).toBe(false);
  });
});

describe("runDslFile", () => {
  test("runs a single exported workflow and returns results keyed by export name", async () => {
    const results = await runDslFile(fixture("simple-workflow.ts"));
    expect(Object.keys(results)).toEqual(["simpleWorkflow"]);
    const outputs = Object.values(results.simpleWorkflow);
    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toBe(42);
  });

  test("runs all exported workflows in a multi-workflow file", async () => {
    const results = await runDslFile(fixture("multi-workflow.ts"));
    const names = Object.keys(results).sort();
    expect(names).toEqual(["workflowA", "workflowB"]);
    const aOutputs = Object.values(results.workflowA);
    const bOutputs = Object.values(results.workflowB);
    expect(aOutputs[0]).toBe(1);
    expect(bOutputs[0]).toBe(2);
  });

  test("throws when the file exports no Workflow objects", async () => {
    await expect(runDslFile(fixture("no-workflow.ts"))).rejects.toThrow(
      "No Workflow exports found"
    );
  });

  test("throws when the file does not exist", async () => {
    await expect(runDslFile(fixture("nonexistent.ts"))).rejects.toThrow();
  });
});

// Skip CLI integration tests in CI or when CLI dist is not built
const workspaceRoot = resolve(__dirname, "../../..");
const cliEntry = join(workspaceRoot, "packages/cli/dist/nodetool.js");
const skipCliIntegration = Boolean(process.env.CI) || !existsSync(cliEntry);

describe.skipIf(skipCliIntegration)(
  "nodetool run <dsl-file> — CLI integration",
  () => {
    const baseFixture = join(
      workspaceRoot,
      "packages/cli/tests/fixtures/base-node-workflow.ts"
    );

    test("exits 0 and prints workflow results for a base-node DSL fixture", () => {
      const result = spawnSync("node", [cliEntry, "run", baseFixture], {
        encoding: "utf8",
        cwd: workspaceRoot
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("baseNodeWorkflow:");
      // The output value should be 99 (from constant.integer({ value: 99 }))
      expect(result.stdout).toContain("99");
    });

    test("--json flag outputs valid JSON with workflow results", () => {
      const result = spawnSync(
        "node",
        [cliEntry, "run", "--json", baseFixture],
        {
          encoding: "utf8",
          cwd: workspaceRoot
        }
      );
      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed).toHaveProperty("baseNodeWorkflow");
      const outputs = Object.values(
        parsed.baseNodeWorkflow as Record<string, unknown>
      );
      expect(outputs).toHaveLength(1);
      expect(outputs[0]).toBe(99);
    });

    test("exits 1 and prints error for a file with no Workflow exports", () => {
      const noWfFixture = join(
        workspaceRoot,
        "packages/cli/tests/fixtures/no-workflow.ts"
      );
      const result = spawnSync("node", [cliEntry, "run", noWfFixture], {
        encoding: "utf8",
        cwd: workspaceRoot
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("No Workflow exports found");
    });

    test("exits 1 for a nonexistent file", () => {
      const result = spawnSync(
        "node",
        [cliEntry, "run", "/nonexistent/path.ts"],
        {
          encoding: "utf8",
          cwd: workspaceRoot
        }
      );
      expect(result.status).toBe(1);
    });
  }
);
