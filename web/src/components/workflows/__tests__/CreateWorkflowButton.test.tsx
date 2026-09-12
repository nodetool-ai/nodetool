import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";

const createNew = jest.fn(async (projectId: string) => ({
  id: "workflow-new",
  name: "New Workflow",
  project_id: projectId
}));
const invalidateQueries = jest.fn();
const navigate = jest.fn();
const openTab = jest.fn();

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries })
}));

jest.mock("react-router-dom", () => ({
  useNavigate: () => navigate
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

import CreateWorkflowButton from "../CreateWorkflowButton";

describe("CreateWorkflowButton", () => {
  it("creates and opens the workflow in the visible project", async () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <CreateWorkflowButton projectId="project-a" />
      </ThemeProvider>
    );

    await userEvent.click(screen.getByRole("button", { name: "New workflow" }));

    await waitFor(() => expect(createNew).toHaveBeenCalledWith("project-a"));
    expect(openTab).toHaveBeenCalledWith({
      type: "workflow",
      ref: "workflow-new",
      mode: "edit",
      title: "New Workflow",
      projectId: "project-a"
    });
    expect(navigate).toHaveBeenCalledWith("/workspace");
  });
});
