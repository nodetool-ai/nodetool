import { expect, test } from "vitest";
import { resolve } from "node:path";
import {
  runDslFile,
  loadDslWorkflows,
  dslWorkflowToGraph
} from "../src/run-dsl.js";

test("loads and executes a callable typed workflow through the real DSL", async () => {
  const file = resolve(import.meta.dirname, "fixtures/typed-workflow.ts");
  const workflows = await loadDslWorkflows(file);
  expect(typeof workflows.greeting).toBe("function");
  expect(
    dslWorkflowToGraph(workflows.greeting).nodes.some(
      (node) => node.type === "nodetool.input.ValueInput"
    )
  ).toBe(true);
  expect(await runDslFile(file)).toEqual({
    greeting: { greeting: "Hello Ada!" }
  });
}, 120_000);
