/**
 * End-to-end check of the mobile app runtime: a saved app document renders as
 * native widgets, a Run button turns widget values into run params, and the
 * streamed messages of that run fold into the bound display widget.
 */
import React from "react";
import { fireEvent, render, screen, act } from "@testing-library/react-native";

import type { Workflow } from "../../../types/workflow";

// The runtime pushes a screen for an `openResource` action; nothing here fires
// one, so a bare navigator stub is enough.
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

const mockRun = jest.fn().mockResolvedValue(undefined);
const mockCancel = jest.fn().mockResolvedValue(undefined);
const mockRunnerState = {
  job_id: null as string | null,
  run: mockRun,
  cancel: mockCancel,
};

jest.mock("../../../stores/WorkflowRunner", () => ({
  useWorkflowRunner: () => ({
    getState: () => mockRunnerState,
    subscribe: () => () => {},
  }),
}));

/** Message handlers registered by the runtime, keyed by topic. */
const mockHandlers = new Map<
  string,
  (message: Record<string, unknown>) => void
>();

jest.mock("../../../services/WebSocketService", () => ({
  webSocketService: {
    subscribe: (key: string, handler: (m: Record<string, unknown>) => void) => {
      mockHandlers.set(key, handler);
      return () => mockHandlers.delete(key);
    },
  },
}));

jest.mock("../../../services/api", () => ({
  apiService: {
    resolveUrl: (uri: string) => uri,
    getApiHost: () => "http://localhost:7777",
  },
}));

import WorkflowAppView from "../WorkflowAppView";

const appDoc = {
  schemaVersion: 3,
  ui: {
    root: { props: { title: "Greeter" } },
    content: [
      {
        type: "Container",
        props: {
          id: "panel",
          title: "Try it",
          content: [
            {
              type: "TextInput",
              props: {
                id: "in-prompt",
                label: "Prompt",
                binding: "op:main/in:n1",
              },
            },
            {
              type: "Button",
              props: {
                id: "btn-run",
                label: "Run",
                events: [{ trigger: "click", kind: "run" }],
              },
            },
            {
              type: "Text",
              props: { id: "out-result", binding: "op:main/out:o1" },
            },
          ],
        },
      },
    ],
    zones: {},
  },
  operations: [
    {
      id: "main",
      name: "Run",
      workflowId: "wf-app",
      inputs: {},
      outputs: {},
      policy: "replace",
    },
  ],
  resources: [],
  variables: [],
};

const makeWorkflow = (id: string, appDocValue?: unknown): Workflow =>
  ({
    id,
    name: "Greeter",
    description: "",
    app_doc: appDocValue,
    graph: {
      nodes: [
        {
          id: "n1",
          type: "nodetool.input.StringInput",
          data: { name: "prompt" },
        },
        {
          id: "o1",
          type: "nodetool.output.StringOutput",
          data: { name: "result" },
        },
      ],
      edges: [],
    },
  }) as unknown as Workflow;

/** Deliver a streamed message the way the websocket service would. */
const emit = (message: Record<string, unknown>) => {
  act(() => {
    mockHandlers.forEach((handler) => handler(message));
  });
};

describe("WorkflowAppView", () => {
  beforeEach(() => {
    mockHandlers.clear();
    mockRun.mockClear();
    mockCancel.mockClear();
    mockRunnerState.job_id = null;
  });

  it("renders the saved app document", () => {
    render(<WorkflowAppView workflow={makeWorkflow("wf-render", appDoc)} />);

    expect(screen.getByText("Greeter")).toBeTruthy();
    expect(screen.getByText("Try it")).toBeTruthy();
    expect(screen.getByText("Prompt")).toBeTruthy();
    expect(screen.getByText("Run")).toBeTruthy();
  });

  it("sends the widget's value as a name-keyed run param", async () => {
    render(<WorkflowAppView workflow={makeWorkflow("wf-run", appDoc)} />);

    fireEvent.changeText(screen.getByDisplayValue(""), "hello");
    await act(async () => {
      fireEvent.press(screen.getByText("Run"));
    });

    expect(mockRun).toHaveBeenCalledTimes(1);
    // Bindings key on node ids; the run protocol wants the node's name.
    expect(mockRun.mock.calls[0][0]).toEqual({ prompt: "hello" });
  });

  it("folds the run's streamed output into the bound display widget", async () => {
    render(<WorkflowAppView workflow={makeWorkflow("wf-stream", appDoc)} />);

    await act(async () => {
      fireEvent.press(screen.getByText("Run"));
    });

    emit({ type: "job_update", job_id: "job-1", status: "running" });
    emit({
      type: "output_update",
      job_id: "job-1",
      node_id: "o1",
      value: "Hi ",
    });
    emit({
      type: "output_update",
      job_id: "job-1",
      node_id: "o1",
      value: "there",
    });

    // Streamed text concatenates into one block rather than replacing.
    expect(screen.getByText("Hi there")).toBeTruthy();
  });

  it("drops messages from a run it did not start", async () => {
    render(<WorkflowAppView workflow={makeWorkflow("wf-foreign", appDoc)} />);

    emit({
      type: "output_update",
      job_id: "someone-elses-job",
      node_id: "o1",
      value: "leaked",
    });

    expect(screen.queryByText("leaked")).toBeNull();
  });

  it("generates an app from the graph when the workflow has none", () => {
    render(<WorkflowAppView workflow={makeWorkflow("wf-generated")} />);

    expect(screen.getByText("Try it")).toBeTruthy();
    expect(screen.getByText("Results")).toBeTruthy();
    expect(screen.getByText("prompt")).toBeTruthy();
    expect(screen.getByText("Run")).toBeTruthy();
  });
});
