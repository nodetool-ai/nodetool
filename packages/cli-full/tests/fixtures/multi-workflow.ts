/**
 * Fixture: two independent base-node workflows exported separately.
 */
import { constant, output, workflow } from "@nodetool-ai/dsl";

const valueA = constant.integer({ value: 1 });
const outA = output.output({ value: valueA.output() });
export const workflowA = workflow(outA);

const valueB = constant.integer({ value: 2 });
const outB = output.output({ value: valueB.output() });
export const workflowB = workflow(outB);
