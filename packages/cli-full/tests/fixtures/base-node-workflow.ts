/**
 * Fixture: uses base nodes included by the CLI's built-in pack policy.
 * Suitable for integration testing with the compiled CLI.
 */
import { constant, output, workflow } from "@nodetool-ai/dsl";

const value = constant.integer({ value: 99 });
const out = output.output({ value: value.output() });

export const baseNodeWorkflow = workflow(out);
