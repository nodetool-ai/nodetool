import React from "react";
import { act, renderHook } from "@testing-library/react";
import {
  chatAppLayout,
  type ApplicationDocument,
  type ChatAppEvent
} from "@nodetool-ai/app-runtime";

import { makeTestRuntime } from "../../__tests__/testRuntime";
import { AppRuntimeContext } from "../../runtime/AppRuntimeContext";
import { ChatAppContext } from "../ChatAppContext";
import { useCardRuntime } from "../useCardRuntime";

const variable = (id: string) => ({
  id,
  name: id,
  type: { type: "str", optional: false, type_args: [] },
  scope: "instance" as const,
  persist: false
});

const document: ApplicationDocument = {
  schemaVersion: 4,
  presentation: "chat",
  ui: {
    root: { props: {} },
    content: [
      { type: "Stepper", props: { id: "steps", binding: "var:step", steps: [{ value: "start", title: "Start" }, { value: "review", title: "Review" }] } },
      {
        type: "Container",
        props: {
          id: "step-start",
          visibleWhen: { binding: "var:step", op: "eq", value: "start" },
          content: [
            { type: "TextInput", props: { id: "title-field", label: "Title", binding: "var:title" } },
            { type: "Button", props: { id: "plan", label: "Plan it" } }
          ]
        }
      }
    ]
  },
  operations: [{ id: "plan", name: "Plan", workflowId: "wf", inputs: {}, outputs: {}, policy: "replace" }],
  resources: [],
  variables: [variable("step"), variable("title"), variable("mode")]
};

const setup = () => {
  const layout = chatAppLayout(document)!;
  const sent: ChatAppEvent[] = [];
  const runtime = makeTestRuntime({ variables: { step: "start" } }, { document });
  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <AppRuntimeContext.Provider value={runtime.value}>
      <ChatAppContext.Provider
        value={{ appRunId: "run-1", document, layout, threadId: "t1", sendEvent: (event) => sent.push(event) }}
      >
        {children}
      </ChatAppContext.Provider>
    </AppRuntimeContext.Provider>
  );
  const hook = renderHook(() => useCardRuntime("start"), { wrapper });
  return { hook, sent, runtime };
};

describe("useCardRuntime", () => {
  it("turns one click's run and step change into one app event", async () => {
    const { hook, sent, runtime } = setup();
    runtime.store.getState().dispatchEvent({ type: "setVariable", variableId: "title", value: "Calm" });
    await act(async () => {
      hook.result.current.dispatch({ kind: "run", operationId: "plan" }, { widgetId: "plan" });
      hook.result.current.dispatch({ kind: "setVariable", variableId: "step", value: "review" }, { widgetId: "plan" });
      await Promise.resolve();
    });
    expect(sent).toEqual([
      {
        step: "start",
        control: "Plan it",
        requests: [
          { kind: "run", operationId: "plan" },
          { kind: "step", step: "review" }
        ],
        changed: ["Title"]
      }
    ]);
    // Nothing ran and the step did not move: the agent decides.
    expect(runtime.value.dispatch).not.toHaveBeenCalled();
    expect(runtime.store.getState().variables.step).toBe("start");
  });

  it("passes local actions through to the runtime", async () => {
    const { hook, sent, runtime } = setup();
    await act(async () => {
      hook.result.current.dispatch({ kind: "setVariable", variableId: "mode", value: "web" });
      await Promise.resolve();
    });
    expect(sent).toEqual([]);
    expect(runtime.value.dispatch).toHaveBeenCalledWith(
      { kind: "setVariable", variableId: "mode", value: "web" },
      undefined
    );
  });

  it("reports only what changed since the last event", async () => {
    const { hook, sent, runtime } = setup();
    runtime.store.getState().dispatchEvent({ type: "setVariable", variableId: "title", value: "Calm" });
    await act(async () => {
      hook.result.current.dispatch({ kind: "run", operationId: "plan" }, { widgetId: "plan" });
      await Promise.resolve();
    });
    await act(async () => {
      hook.result.current.dispatch({ kind: "run", operationId: "plan" }, { widgetId: "plan" });
      await Promise.resolve();
    });
    expect(sent[1]).toEqual({ step: "start", control: "Plan it", requests: [{ kind: "run", operationId: "plan" }] });
  });
});
