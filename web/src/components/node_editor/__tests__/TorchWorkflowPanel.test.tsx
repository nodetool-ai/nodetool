import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { useTorchExecutionStore } from "../../../stores/TorchExecutionStore";
import TorchWorkflowPanel, { parseTorchInputs } from "../TorchWorkflowPanel";

const mockSave = jest.fn();
const mockStart = jest.fn();
const mockUpdate = jest.fn((workflow: typeof mockWorkflow) => {
  mockState.workflow = workflow;
});
const mockWorkflow = {
  id: "torch-workflow",
  name: "Tensor workflow",
  settings: { execution: { kind: "torch", version: 1, target: "cpu" } },
  graph: { nodes: [], edges: [] }
};
const mockState = {
  workflow: mockWorkflow,
  nodes: [],
  getWorkflow: () => mockState.workflow,
  setWorkflowDirty: jest.fn()
};
let mockEnabled = true;

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: (selector: (state: typeof mockState) => unknown) =>
    selector(mockState),
  useNodeStoreRef: () => ({ getState: () => mockState })
}));
jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (selector: (state: { saveWorkflow: typeof mockSave; updateWorkflow: typeof mockUpdate }) => unknown) =>
    selector({
      saveWorkflow: mockSave,
      updateWorkflow: mockUpdate
    })
}));
jest.mock("../../../serverState/useTorchWorkflow", () => ({
  useTorchCapabilities: () => ({
    data: {
      enabled: mockEnabled,
      reason: "Enable local Torch compilation",
      targets: ["cpu", "cuda"]
    }
  }),
  useTorchStart: () => ({ mutateAsync: mockStart, isPending: false }),
  useTorchCancel: () => ({ mutate: jest.fn(), isPending: false }),
  useTorchStatus: () => ({ data: undefined })
}));

const renderPanel = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TorchWorkflowPanel workflowId="torch-workflow" />
    </ThemeProvider>
  );

describe("TorchWorkflowPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState.workflow = structuredClone(mockWorkflow);
    mockEnabled = true;
    mockSave.mockResolvedValue(undefined);
    mockStart.mockResolvedValue({ job_id: "torch-job" });
    useTorchExecutionStore.getState().open("torch-workflow");
  });

  it("saves the current editor graph before compiling", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: /^Compile$/ }));
    await waitFor(() =>
      expect(mockStart).toHaveBeenCalledWith({
        workflow_id: "torch-workflow",
        target: "cpu",
        action: "compile"
      })
    );
    expect(mockSave).toHaveBeenCalledWith({
      ...mockWorkflow,
      settings: { execution: { ...mockWorkflow.settings.execution, inputs: {} } }
    });
    expect(mockSave.mock.invocationCallOrder[0]).toBeLessThan(
      mockStart.mock.invocationCallOrder[0]
    );
  });

  it("keeps compilation unavailable when the local capability is disabled", () => {
    mockEnabled = false;
    renderPanel();
    expect(screen.getByRole("button", { name: /^Compile$/ })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Compile and run" })
    ).toBeDisabled();
    expect(screen.getByText("Enable local Torch compilation")).toBeVisible();
  });

  it("does not start a compile when saving fails", async () => {
    mockSave.mockRejectedValue(new Error("Workflow conflict"));
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: /^Compile$/ }));
    expect(await screen.findByText("Workflow conflict")).toBeVisible();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("validates tensor values before saving or running", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.type(
      screen.getByRole("textbox", { name: "Tensor inputs (JSON)" }),
      "invalid"
    );
    await user.click(screen.getByRole("button", { name: "Compile and run" }));
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("submits named tensors through the Torch run action", async () => {
    const user = userEvent.setup();
    renderPanel();
    const input = screen.getByRole("textbox", { name: "Tensor inputs (JSON)" });
    await user.clear(input);
    await user.click(input);
    await user.paste('{"x":{"shape":[2],"values":[1,2]}}');
    await user.click(screen.getByRole("button", { name: "Compile and run" }));

    await waitFor(() =>
      expect(mockStart).toHaveBeenCalledWith({
        workflow_id: "torch-workflow",
        target: "cpu",
        action: "run",
        inputs: { x: { shape: [2], values: [1, 2] } }
      })
    );
    expect(mockSave.mock.calls[0][0].settings.execution.inputs).toEqual({
      x: { shape: [2], values: [1, 2] }
    });
  });
});

describe("parseTorchInputs", () => {
  it("preserves named scalar and fixed-shape tensor inputs", () => {
    expect(
      parseTorchInputs(
        '{"scalar":{"shape":[],"values":[2]},"x":{"shape":[2],"values":[1,3]}}'
      )
    ).toEqual({
      scalar: { shape: [], values: [2] },
      x: { shape: [2], values: [1, 3] }
    });
  });

  it("preserves input names that match object prototype properties", () => {
    const inputs = parseTorchInputs('{"__proto__":{"shape":[1],"values":[2]}}');
    expect(Object.keys(inputs)).toEqual(["__proto__"]);
    expect(JSON.stringify(inputs)).toBe(
      '{"__proto__":{"shape":[1],"values":[2]}}'
    );
  });

  it.each([
    "[]",
    "null",
    '{"x":{"shape":[2],"values":[1]}}',
    '{"x":{"shape":[1.5],"values":[1]}}',
    '{"x":{"shape":[-1],"values":[1]}}',
    '{"x":{"shape":[0],"values":[]}}',
    '{"x":{"shape":[1],"values":["1"]}}'
  ])("rejects invalid tensor input %s", (raw) => {
    expect(() => parseTorchInputs(raw)).toThrow();
  });
});
