/**
 * Fixture: single Constant(42) node exported as a Workflow.
 * Uses test nodes — caller must register them in NodeRegistry.global first.
 */
import { createNode, workflow } from "@nodetool/dsl";
import type { SingleOutput } from "@nodetool/dsl";

const a = createNode<SingleOutput<number, "value">>(
  "nodetool.test.Constant",
  { value: 42 },
  { outputNames: ["value"], defaultOutput: "value" },
);

export const simpleWorkflow = workflow(a);
