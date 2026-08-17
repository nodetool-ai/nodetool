/**
 * Provides the bindable workflow surface (inputs / outputs / variables) to
 * Puck's custom binding fields, which can't otherwise reach component-external
 * data.
 *
 * An app binds one operation per workflow it runs, and a binding names the
 * operation it belongs to. So the editor carries the document's operations and
 * the operation the author is currently binding against — the pickers persist
 * that id instead of assuming an operation called `main` exists.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState
} from "react";
import {
  DEFAULT_OPERATION_ID,
  type BindingScope,
  type OperationBinding
} from "@nodetool-ai/app-runtime";

import { WorkflowState } from "../workflowState";

const EMPTY_STATE: WorkflowState = {
  inputs: [],
  outputs: [],
  variables: [],
  nodes: [],
  resources: []
};

interface BuilderWorkflowContextValue {
  /** Every operation the document declares, in document order. */
  operations: ReadonlyArray<OperationBinding>;
  /** The operation a new binding is written against. */
  selectedOperationId: string;
  selectOperation: (operationId: string) => void;
  /** The bindable surface of one operation; the host workflow's when unknown. */
  workflowFor: (operationId?: string) => WorkflowState;
}

const BuilderWorkflowContext = createContext<BuilderWorkflowContextValue>({
  operations: [],
  selectedOperationId: DEFAULT_OPERATION_ID,
  selectOperation: () => {},
  workflowFor: () => EMPTY_STATE
});

interface BuilderWorkflowProviderProps {
  /** The host workflow's bindable surface. */
  value: WorkflowState;
  /** The document's operations. Empty for an app with none bound yet. */
  operations?: ReadonlyArray<OperationBinding>;
  /**
   * The bindable surface per operation id, for apps whose operations run
   * different workflows. An operation absent here falls back to the host.
   */
  states?: ReadonlyMap<string, WorkflowState>;
  children: React.ReactNode;
}

export const BuilderWorkflowProvider: React.FC<BuilderWorkflowProviderProps> = ({
  value,
  operations = [],
  states,
  children
}) => {
  const [selected, setSelected] = useState<string | null>(null);
  const selectedOperationId =
    selected && operations.some((op) => op.id === selected)
      ? selected
      : operations[0]?.id ?? DEFAULT_OPERATION_ID;

  const workflowFor = useCallback(
    (operationId?: string): WorkflowState => {
      if (!operationId) return value;
      return states?.get(operationId) ?? value;
    },
    [states, value]
  );

  const context = useMemo<BuilderWorkflowContextValue>(
    () => ({
      operations,
      selectedOperationId,
      selectOperation: setSelected,
      workflowFor
    }),
    [operations, selectedOperationId, value, workflowFor]
  );

  return (
    <BuilderWorkflowContext.Provider value={context}>
      {children}
    </BuilderWorkflowContext.Provider>
  );
};

/** The bindable surface of the operation currently being bound against. */
export const useBuilderWorkflow = (): WorkflowState => {
  const { selectedOperationId, workflowFor } = useContext(
    BuilderWorkflowContext
  );
  return workflowFor(selectedOperationId);
};

/** The document's operations plus the one the pickers write bindings against. */
export const useBuilderOperations = (): BuilderWorkflowContextValue =>
  useContext(BuilderWorkflowContext);

/**
 * The same scope the runtime resolves bindings against, so the editor's
 * pickers can normalize a stored binding (a legacy name, a legacy `main` token,
 * or an ID token) to one canonical form before matching it against their
 * options.
 */
export const useBuilderBindingScope = (): BindingScope => {
  const { operations, workflowFor } = useContext(BuilderWorkflowContext);
  // `workflowFor` is rebuilt whenever the host graph or an operation's graph
  // changes, so it alone keeps the scope current.
  return useMemo(() => {
    const ids =
      operations.length > 0
        ? operations.map((op) => op.id)
        : [DEFAULT_OPERATION_ID];
    return {
      defaultOperationId: ids[0],
      operations: ids.map((operationId) => {
        const state = workflowFor(operationId);
        return {
          operationId,
          inputs: state.inputs.map(({ nodeId, name }) => ({ nodeId, name })),
          outputs: state.outputs.map(({ nodeId, name }) => ({ nodeId, name })),
          nodeIds: state.nodes.map((n) => n.id),
          variableNames: state.variables
        };
      }),
      variables: []
    };
  }, [operations, workflowFor]);
};
