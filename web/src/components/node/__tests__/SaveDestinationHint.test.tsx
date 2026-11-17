import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import SaveDestinationHint from "../SaveDestinationHint";
import { NodeData } from "../../../stores/NodeData";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";

const filmFolder = {
  folder: {
    workspace_id: "ws-film",
    path: "/home/me/NodeTool/My Film",
    origin: "created",
    is_accessible: true
  },
  projectName: "My Film",
  isLoading: false
};

let folderState: {
  folder: typeof filmFolder.folder | null;
  projectName: string | null;
  isLoading: boolean;
} = filmFolder;
const useProjectFolder = jest.fn((_projectId: string) => folderState);

jest.mock("../../../hooks/useProjectFolder", () => ({
  useProjectFolder: (projectId: string) => useProjectFolder(projectId)
}));

const renderHint = (properties: Record<string, unknown>) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider theme={mockTheme}>
        <SaveDestinationHint data={{ properties } as unknown as NodeData} />
      </ThemeProvider>
    </QueryClientProvider>
  );

describe("SaveDestinationHint", () => {
  beforeEach(() => {
    folderState = filmFolder;
    useProjectFolder.mockClear();
    useWorkspaceTabsStore.setState({
      activeProjectId: "project-film",
      personalProjectId: "personal"
    });
  });

  it("names the folder of the active project", async () => {
    renderHint({ save_to_workspace: true });
    expect(await screen.findByText("My Film")).toBeInTheDocument();
    expect(useProjectFolder).toHaveBeenCalledWith("project-film");
  });

  it("falls back to a bare label while the projects are still loading", () => {
    folderState = { folder: null, projectName: null, isLoading: true };
    renderHint({ save_to_workspace: true });
    expect(screen.getByText("Project folder")).toBeInTheDocument();
  });

  it("renders nothing while the toggle is off", () => {
    const { container } = renderHint({ save_to_workspace: false });
    expect(container).toBeEmptyDOMElement();
  });
});
