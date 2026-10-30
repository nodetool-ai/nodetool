/**
 * Fixture: single base-node workflow exported as a Workflow.
 */
import { constant, output, workflow } from "@nodetool-ai/dsl";

const value = constant.integer({ value: 42 });
const out = output.output({ value: value.output() });

export const simpleWorkflow = workflow(out);
