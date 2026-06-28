/**
 * Provides the bindable workflow surface (inputs / outputs / variables) to
 * Puck's custom binding fields, which can't otherwise reach component-external
 * data.
 */
import React, { createContext, useContext } from "react";
import { WorkflowState } from "../workflowState";

const BuilderWorkflowContext = createContext<WorkflowState>({
  inputs: [],
  outputs: [],
  variables: []
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
