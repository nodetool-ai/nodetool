/**
 * Fixture: two independent single-node workflows exported separately.
 * Uses test nodes — caller must register them in NodeRegistry.global first.
 */
import { createNode, workflow } from "@nodetool/dsl";
import type { SingleOutput } from "@nodetool/dsl";

const a = createNode<SingleOutput<number, "value">>(
  "nodetool.test.Constant",
  { value: 1 },
  { outputNames: ["value"], defaultOutput: "value" },
);
export const workflowA = workflow(a);

const b = createNode<SingleOutput<number, "value">>(
  "nodetool.test.Constant",
  { value: 2 },
  { outputNames: ["value"], defaultOutput: "value" },
);
export const workflowB = workflow(b);
