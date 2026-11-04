import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const createNew = jest.fn(async () => ({ id: "torch-new", name: "CNN" }));
const invalidateQueries = jest.fn();
const navigate = jest.fn();
const openTab = jest.fn();
const fixture = {
  id: "cnn",
  name: "CNN",
  graph: { nodes: [{ id: "input", type: "nodetool.torch.Input" }], edges: [] },
  exampleInputs: { image: { shape: [1, 1, 2, 2], values: [1, 2, 3, 4] } }
};

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries })
}));
jest.mock("react-router-dom", () => ({ useNavigate: () => navigate }));
jest.mock("../../../serverState/useTorchCatalog", () => ({
  useTorchCatalog: () => ({
    data: { nodes: [], templates: [fixture] },
    isLoading: false
  })
}));
jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: <T,>(
    selector: (state: { createNew: typeof createNew }) => T
  ) => selector({ createNew })
}));
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  creationProjectId: () => "default",
  useWorkspaceTabsStore: <T,>(
    selector: (state: { openTab: typeof openTab }) => T
  ) => selector({ openTab })
}));
jest.mock("../../support/ErrorBanner", () => ({
  __esModule: true,
  default: () => null
}));
import CreateTorchWorkflowDialog from "../CreateTorchWorkflowDialog";

it("opens a Torch template with its tensor inputs in the selected project", async () => {
  const onClose = jest.fn();
  render(
    <ThemeProvider theme={mockTheme}>
      <CreateTorchWorkflowDialog projectId="project-a" onClose={onClose} />
    </ThemeProvider>
  );
  await userEvent.click(screen.getByRole("button", { name: "CNN" }));
  await waitFor(() =>
    expect(createNew).toHaveBeenCalledWith("project-a", {
      name: "CNN",
      graph: fixture.graph,
      settings: {
        execution: {
          kind: "torch",
          version: 1,
          target: "cpu",
          inputs: fixture.exampleInputs
        }
      }
    })
  );
  expect(openTab).toHaveBeenCalledWith({
    type: "workflow",
    ref: "torch-new",
    mode: "edit",
    title: "CNN",
    projectId: "project-a"
  });
  expect(navigate).toHaveBeenCalledWith("/workspace");
  expect(onClose).toHaveBeenCalled();
});
