import {
  applyEvents,
  createInstanceState,
  messageToEvents,
  outputVariableTargets,
  parseApplicationDocument
} from "@nodetool-ai/app-runtime";
import type { AppRunRecord } from "@nodetool-ai/protocol/api-schemas/app-runs.js";

/** Fold the server messages even when the browser that started the run disconnects. */
export function createAppRunFold(run: AppRunRecord) {
  const document = run.snapshot
    ? parseApplicationDocument(run.snapshot.document)
    : null;
  const operation = document?.operations.find(
    (item) => item.id === run.operation_id
  );
  const targets = new Map(
    operation
      ? outputVariableTargets(operation).map((item) => [
          item.nodeId,
          item.variableId
        ])
      : []
  );
  let state = applyEvents(createInstanceState(), [
    {
      type: "runStarted",
      invocation: {
        id: run.invocation_id,
        operationId: run.operation_id,
        status: "running",
        startedAt: Date.parse(run.created_at)
      },
      outputKeys: Object.keys(operation?.outputs ?? {}).map(
        (id) => `${run.operation_id}:${id}`
      ),
      variableKeys: [...targets.values()]
    }
  ]);
  return {
    fold(message: Record<string, unknown>): void {
      state = applyEvents(
        state,
        messageToEvents(message, {
          resolveInvocation: (id) =>
            id == null || id === run.invocation_id
              ? (state.invocations[run.invocation_id] ?? null)
              : null,
          outputKey: (_, id) => `${run.operation_id}:${id}`,
          outputVariable: (_, id) => targets.get(id) ?? null
        })
      );
    },
    outputs(): Record<string, unknown> {
      return {
        ...state.variables,
        __app_outputs: Object.fromEntries(
          Object.entries(state.outputs).map(([id, slot]) => [id, slot.value])
        )
      };
    }
  };
}
