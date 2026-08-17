/**
 * The awaited form of a node call: run the node, return its outputs.
 *
 * A node whose `genProcess` yields several records is drained and folded to the
 * last value per slot — the same fold the runner applies to terminal outputs. A
 * node written against the `run(inputs, outputs, context)` contract is drained
 * the same way, over its emissions. Callers who want the items themselves use
 * `invokeStream` (./streaming.ts).
 */
import { foldRecords, genProcessRecords, withCall, type CallOptions } from "./core.js";
import { foldEmissions, runContractEmissions } from "./streaming.js";

export async function invoke(
  nodeType: string,
  inputs: Record<string, unknown>,
  opts?: CallOptions
): Promise<Record<string, unknown>> {
  return withCall(nodeType, inputs, opts, async (scope) => {
    if (scope.executor.run) {
      return foldEmissions(runContractEmissions(scope, inputs));
    }
    const records: Array<Record<string, unknown>> = [];
    for await (const record of genProcessRecords(scope, inputs)) {
      records.push(record);
    }
    return foldRecords(records);
  });
}
