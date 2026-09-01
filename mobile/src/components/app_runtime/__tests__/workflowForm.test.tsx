/**
 * `WorkflowForm`: every input of one operation in one widget.
 *
 * What the rows are worth is which slot each one writes, so the assertions go
 * through the run params — the same name-keyed bag the server receives — rather
 * than through the store. A row that wrote the wrong slot renders identically
 * and would pass a render-only test.
 */
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import {
  parseApplicationDocument,
  type ApplicationDocument,
} from "@nodetool-ai/app-runtime";

import type { Workflow } from "../../../types/workflow";

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

const mockRun = jest.fn().mockResolvedValue(undefined);

jest.mock("../../../stores/WorkflowRunner", () => ({
  useWorkflowRunner: () => ({
    getState: () => ({ job_id: null, run: mockRun, cancel: jest.fn() }),
    subscribe: () => () => {},
  }),
}));

jest.mock("../../../trpc/client", () => ({
  trpc: {
    assets: { get: { useQuery: () => ({ data: undefined, isLoading: false }) } },
    useQueries: () => [],
  },
}));

import { webSocketService } from "../../../services/WebSocketService";

jest.spyOn(webSocketService, "subscribe").mockReturnValue(() => {});

import { apiService } from "../../../services/api";

jest.spyOn(apiService, "resolveUrl").mockImplementation((uri) => uri ?? null);
jest.spyOn(apiService, "getApiHost").mockReturnValue("http://localhost:7777");

import ApplicationAppView from "../ApplicationAppView";

const RUN_BUTTON = {
  type: "Button",
  props: {
    id: "btn-run",
    label: "Run",
    events: [{ trigger: "click", kind: "run" }],
  },
};

const appDoc = (formProps: Record<string, unknown>, extra: unknown[] = []) => ({
  schemaVersion: 3,
  ui: {
    root: { props: { title: "Form" } },
    content: [
      { type: "WorkflowForm", props: { id: "form-1", ...formProps } },
      RUN_BUTTON,
      ...extra,
    ],
    zones: {},
  },
  operations: [
    {
      id: "main",
      name: "Run",
      workflowId: "wf-form",
      inputs: {},
      outputs: {},
      policy: "replace",
    },
  ],
  resources: [],
  variables: [],
});

/** Three inputs of three kinds, so each row has to pick its own control. */
const NODES = [
  {
    id: "n1",
    type: "nodetool.input.StringInput",
    data: { name: "prompt", label: "Prompt", description: "What to write" },
  },
  {
    id: "n2",
    type: "nodetool.input.IntegerInput",
    data: { name: "count", label: "Count" },
  },
  {
    id: "n3",
    type: "nodetool.input.BooleanInput",
    data: { name: "loud", label: "Loud" },
  },
];

const workflow = (nodes: unknown[]): Workflow =>
  ({
    id: "wf-form",
    name: "Form",
    description: "",
    graph: { nodes, edges: [] },
    access: "private",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    // The fixtures carry only the fields the widgets read.
  }) as unknown as Workflow;

const renderForm = (
  formProps: Record<string, unknown> = {},
  nodes: unknown[] = NODES
) =>
  render(
    <ApplicationAppView
      document={parseApplicationDocument(appDoc(formProps)) as ApplicationDocument}
      workflow={workflow(nodes)}
    />
  );

beforeEach(() => {
  mockRun.mockClear();
});

describe("WorkflowForm", () => {
  it("renders one row per input, with the control each kind needs", () => {
    renderForm({ label: "Settings" });

    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByText("Prompt")).toBeTruthy();
    expect(screen.getByText("Count")).toBeTruthy();
    expect(screen.getByText("Loud")).toBeTruthy();
    // Boolean renders a switch, not a text box.
    expect(screen.getByRole("switch")).toBeTruthy();
  });

  it("writes each row to its own input slot", async () => {
    renderForm();

    fireEvent.changeText(screen.getByDisplayValue(""), "hello");
    fireEvent(screen.getByRole("switch"), "valueChange", true);

    await act(async () => {
      fireEvent.press(screen.getByText("Run"));
    });

    // Bindings key on node ids; the run protocol wants each node's name — so a
    // row that wrote another node's slot lands under the wrong key here.
    expect(mockRun).toHaveBeenCalledTimes(1);
    expect(mockRun.mock.calls[0][0]).toMatchObject({
      prompt: "hello",
      loud: true,
    });
  });

  it("fires the form's change events on any row change", async () => {
    renderForm({ events: [{ trigger: "change", kind: "run" }] });

    await act(async () => {
      fireEvent(screen.getByRole("switch"), "valueChange", true);
    });

    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it("captions each row with the input's description", () => {
    renderForm();

    expect(screen.getByText("What to write")).toBeTruthy();
  });

  it("hides the descriptions when the author turned them off", () => {
    renderForm({ showDescriptions: "no" });

    expect(screen.queryByText("What to write")).toBeNull();
  });

  it("says so when the operation has no inputs", () => {
    renderForm({ label: "Settings" }, []);

    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByText("This operation has no inputs.")).toBeTruthy();
  });

  it("picks up an Input node the app document never mentions", () => {
    // The form binds no node, so a graph edit reaches it with no app edit.
    renderForm({}, [
      ...NODES,
      {
        id: "n4",
        type: "nodetool.input.StringInput",
        data: { name: "tone", label: "Tone" },
      },
    ]);

    expect(screen.getByText("Tone")).toBeTruthy();
  });
});
