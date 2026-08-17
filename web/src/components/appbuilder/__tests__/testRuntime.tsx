/**
 * Test harness for anything that needs a live app runtime context: a small
 * workflow surface (one input, one output, one variable), a store, and a
 * provider wrapper.
 */
import React from "react";
import {
  DEFAULT_OPERATION_ID,
  implicitOperation,
  type AppInstanceState,
  type BindingScope
} from "@nodetool-ai/app-runtime";

import {
  AppRuntimeContext,
  type AppRuntimeContextValue
} from "../runtime/AppRuntimeContext";
import {
  createAppRuntimeStore,
  type AppRuntimeStore
} from "../runtime/appRuntimeStore";

export const TEST_SCOPE: BindingScope = {
  defaultOperationId: DEFAULT_OPERATION_ID,
  operations: [
    {
      operationId: DEFAULT_OPERATION_ID,
      inputs: [{ nodeId: "in1", name: "prompt" }],
      outputs: [{ nodeId: "out1", name: "result" }],
      nodeIds: ["in1", "out1", "n5"],
      variableNames: ["dark"]
    }
  ],
  variables: []
};

export const INPUT_KEY = `${DEFAULT_OPERATION_ID}:in1`;
export const OUTPUT_KEY = `${DEFAULT_OPERATION_ID}:out1`;

interface TestRuntime {
  store: AppRuntimeStore;
  value: AppRuntimeContextValue;
  wrapper: React.FC<{ children: React.ReactNode }>;
}

export const makeTestRuntime = (
  initial: Partial<AppInstanceState> = {},
  overrides: Partial<AppRuntimeContextValue> = {}
): TestRuntime => {
  const store = createAppRuntimeStore(initial);
  const io = overrides.io ?? { inputs: [], outputs: [] };
  const value: AppRuntimeContextValue = {
    store,
    io,
    ioFor: () => io,
    scope: TEST_SCOPE,
    operation: implicitOperation("wf1"),
    operations: [implicitOperation("wf1")],
    resources: [],
    designMode: false,
    dispatch: jest.fn(),
    write: jest.fn((ref, next) => {
      if (ref.kind === "variable") {
        store
          .getState()
          .dispatchEvent({ type: "setVariable", variableId: ref.variableId, value: next });
      } else if (ref.kind === "view") {
        store.getState().dispatchEvent({
          type: "setView",
          key: `${ref.componentId}:${ref.prop}`,
          value: next
        });
      } else if (ref.kind === "input" || ref.kind === "nodeProperty") {
        store.getState().dispatchEvent({
          type: "setInput",
          key:
            ref.kind === "input"
              ? `${ref.operationId}:${ref.nodeId}`
              : `${ref.operationId}:${ref.nodeId}#${ref.property}`,
          value: next
        });
      }
    }),
    selectResource: jest.fn(),
    getNodeProperty: jest.fn(),
    ...overrides
  };
  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <AppRuntimeContext.Provider value={value}>
      {children}
    </AppRuntimeContext.Provider>
  );
  return { store, value, wrapper };
};
