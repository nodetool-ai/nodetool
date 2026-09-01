/**
 * End-to-end check of the mobile app runtime: an application document renders
 * as native widgets, a Run button turns widget values into run params, and the
 * streamed messages of that run fold into the bound display widget.
 */
import { fireEvent, render, screen, act } from "@testing-library/react-native";
import { v4 as uuidv4 } from "uuid";
import {
  parseApplicationDocument,
  type ApplicationDocument,
} from "@nodetool-ai/app-runtime";

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

import { webSocketService } from "../../../services/WebSocketService";

// The real socket singleton; `subscribe` is stubbed to capture the handler so
// the test can feed it messages without dialling out.
jest.spyOn(webSocketService, "subscribe").mockImplementation((key, handler) => {
  mockHandlers.set(key, handler);
  return () => {
    mockHandlers.delete(key);
  };
});

import { apiService } from "../../../services/api";

// The real `apiService` singleton, with only the two host-dependent lookups
// pinned so URLs are stable regardless of the configured API host.
jest.spyOn(apiService, "resolveUrl").mockImplementation((uri) => uri ?? null);
jest.spyOn(apiService, "getApiHost").mockReturnValue("http://localhost:7777");

import ApplicationAppView from "../ApplicationAppView";

/** The document as the applications API serves it — no workflow involved. */
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

const document = parseApplicationDocument(appDoc) as ApplicationDocument;

/** The workflow an operation binds — never carrying an app document itself. */
const makeWorkflow = (id: string): Workflow =>
  ({
    id,
    name: "Greeter",
    description: "",
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
    access: "private",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  });

/** Deliver a streamed message the way the websocket service would. */
const emit = (message: Record<string, unknown>) => {
  act(() => {
    mockHandlers.forEach((handler) => handler(message));
  });
};

describe("ApplicationAppView", () => {
  beforeEach(() => {
    mockHandlers.clear();
    mockRun.mockClear();
    mockCancel.mockClear();
    mockRunnerState.job_id = null;
    // The runtime mints the job id before it sends the run; the tests below
    // emit messages for the id it will hand out.
    (uuidv4 as jest.Mock).mockReturnValue("job-1");
  });

  it("renders the application document", () => {
    render(
      <ApplicationAppView
        document={document}
        workflow={makeWorkflow("wf-render")}
      />
    );

    expect(screen.getByText("Greeter")).toBeTruthy();
    expect(screen.getByText("Try it")).toBeTruthy();
    expect(screen.getByText("Prompt")).toBeTruthy();
    expect(screen.getByText("Run")).toBeTruthy();
  });

  it("sends the widget's value as a name-keyed run param", async () => {
    render(
      <ApplicationAppView
        document={document}
        workflow={makeWorkflow("wf-run")}
      />
    );

    fireEvent.changeText(screen.getByDisplayValue(""), "hello");
    await act(async () => {
      fireEvent.press(screen.getByText("Run"));
    });

    expect(mockRun).toHaveBeenCalledTimes(1);
    // Bindings key on node ids; the run protocol wants the node's name.
    expect(mockRun.mock.calls[0][0]).toEqual({ prompt: "hello" });
  });

  it("folds the run's streamed output into the bound display widget", async () => {
    render(
      <ApplicationAppView
        document={document}
        workflow={makeWorkflow("wf-stream")}
      />
    );

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
    render(
      <ApplicationAppView
        document={document}
        workflow={makeWorkflow("wf-foreign")}
      />
    );

    emit({
      type: "output_update",
      job_id: "someone-elses-job",
      node_id: "o1",
      value: "leaked",
    });

    expect(screen.queryByText("leaked")).toBeNull();
  });

  it("shows no heading of its own when the document has no title", () => {
    const untitled: ApplicationDocument = {
      ...document,
      ui: { ...document.ui, root: { props: {} } },
    };
    render(
      <ApplicationAppView
        document={untitled}
        workflow={makeWorkflow("wf-untitled")}
      />
    );

    // AppScreen puts the application name in the navigation header, so a
    // fallback here printed it twice on one screen.
    expect(screen.queryByText("Greeter")).toBeNull();
  });
});
