/**
 * Turning an operation binding into a run.
 *
 * Bindings key on node IDs; the run protocol wants a name-keyed `params`
 * object. That translation happens here, at the execution boundary, which is
 * exactly why a graph rename never reaches the app document.
 */
import type {
  OperationBinding,
  ResourceRef,
  VariableDeclaration
} from "./document.js";
import { DEFAULT_OPERATION_ID } from "./document.js";
import { stateKey } from "./bindings.js";
import type { AppInstanceState } from "./state.js";

export interface ResolveParamsContext {
  operation: OperationBinding;
  state: AppInstanceState;
  /** Input node id → the name the run protocol expects for it. */
  inputName: (nodeId: string) => string | undefined;
  /** Node ids of the operation's inputs, in graph order. */
  inputNodeIds: ReadonlyArray<string>;
  /** The resource a binding currently points at, when one is selected. */
  resourceRef?: (resourceBindingId: string) => ResourceRef | undefined;
}

/**
 * Build the name-keyed `params` for one operation's run. An input with no
 * explicit mapping takes the bound widget's value, which is the common case
 * and what a legacy single-operation app does for every input.
 */
export const resolveOperationParams = (
  ctx: ResolveParamsContext
) => {
  const { operation, state } = ctx;
  const params: Record<string, unknown> = {};

  for (const nodeId of ctx.inputNodeIds) {
    const name = ctx.inputName(nodeId);
    if (!name) continue;
    const mapping = operation.inputs[nodeId] ?? { from: "widget" as const };

    let value: unknown;
    switch (mapping.from) {
      case "variable":
        value = state.variables[mapping.variableId];
        break;
      case "constant":
        value = mapping.value;
        break;
      case "resource":
        value = ctx.resourceRef?.(mapping.resourceBindingId);
        break;
      case "widget":
      default:
        value =
          state.inputs[
            stateKey({
              kind: "input",
              operationId: operation.id,
              nodeId
            })
          ]?.value;
    }
    if (value !== undefined) params[name] = value;
  }

  return params;
};

/**
 * Where an operation's outputs land. An output mapped `to: "variable"` writes
 * app state — that is how "run analysis, let the user review, then publish"
 * works without a procedure language: operation A writes a variable, a display
 * widget shows it, and operation B reads it.
 */
export const outputVariableTargets = (
  operation: OperationBinding
): Array<{ nodeId: string; variableId: string }> =>
  Object.entries(operation.outputs).flatMap(([nodeId, mapping]) =>
    mapping.to === "variable"
      ? [{ nodeId, variableId: mapping.variableId }]
      : []
  );

/**
 * The declared defaults an instance starts from: variable id → `default`, for
 * every variable that declares one. Feed it to the `seedVariables` event, which
 * never clobbers — so a restored user-scoped value, seeded first, wins over the
 * document's default.
 */
export const initialVariableValues = (
  variables: ReadonlyArray<VariableDeclaration>
) => {
  const values: Record<string, unknown> = {};
  for (const variable of variables) {
    if (variable.default === undefined) continue;
    values[variable.id] = variable.default;
  }
  return values;
};

/**
 * The operation a legacy single-workflow app runs: every input takes its bound
 * widget's value, every output displays. Lets one code path serve both a
 * document with explicit operations and one imported from `workflow.app_doc`.
 */
export const implicitOperation = (workflowId: string): OperationBinding => ({
  id: DEFAULT_OPERATION_ID,
  name: "Run",
  workflowId,
  inputs: {},
  outputs: {},
  policy: "replace"
});

/** Variables a document declares, plus the SetVariable channels a graph publishes. */
export const mergeVariables = (
  declared: ReadonlyArray<VariableDeclaration>,
  channelNames: ReadonlyArray<string>
): VariableDeclaration[] => {
  const byId = new Map(declared.map((v) => [v.id, v]));
  for (const name of channelNames) {
    if (byId.has(name)) continue;
    if (declared.some((v) => v.name === name)) continue;
    byId.set(name, {
      id: name,
      name,
      scope: "instance",
      persist: false
    });
  }
  return [...byId.values()];
};
