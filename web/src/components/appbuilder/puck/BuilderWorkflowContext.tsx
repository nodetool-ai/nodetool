/**
 * Provides the bindable workflow surface (inputs / outputs / variables) to
 * Puck's custom binding fields, which can't otherwise reach component-external
 * data.
 */
import React, { createContext, useContext, useMemo } from "react";
import {
  DEFAULT_OPERATION_ID,
  type BindingScope
} from "@nodetool-ai/app-runtime";

import { WorkflowState } from "../workflowState";

const BuilderWorkflowContext = createContext<WorkflowState>({
  inputs: [],
  outputs: [],
  variables: [],
  nodes: [],
  resources: []
});

export const BuilderWorkflowProvider: React.FC<{
  value: WorkflowState;
  children: React.ReactNode;
}> = ({ value, children }) => (
  <BuilderWorkflowContext.Provider value={value}>
    {children}
  </BuilderWorkflowContext.Provider>
);

export const useBuilderWorkflow = (): WorkflowState =>
  useContext(BuilderWorkflowContext);

/**
 * The same scope the runtime resolves bindings against, so the editor's
 * pickers can normalize a stored binding (a legacy name or an ID token) to one
 * canonical form before matching it against their options.
 */
export const useBuilderBindingScope = (): BindingScope => {
  const { inputs, outputs, variables, nodes } = useBuilderWorkflow();
  return useMemo(
    () => ({
      defaultOperationId: DEFAULT_OPERATION_ID,
      operations: [
        {
          operationId: DEFAULT_OPERATION_ID,
          inputs: inputs.map(({ nodeId, name }) => ({ nodeId, name })),
          outputs: outputs.map(({ nodeId, name }) => ({ nodeId, name })),
          nodeIds: nodes.map((n) => n.id),
          variableNames: variables
        }
      ],
      variables: []
    }),
    [inputs, outputs, variables, nodes]
  );
};
