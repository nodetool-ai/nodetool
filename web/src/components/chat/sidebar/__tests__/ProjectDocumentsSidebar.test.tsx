import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";

const openTab = jest.fn();
const getProject = jest.fn((input: { id: string }) => ({
  data: {
    project: { id: input.id, name: `Project ${input.id}` },
    documents: [{
      type: "storyboard",
      ref: `${input.id}-board`,
      name: `${input.id} board`,
      status: { kind: "storyboard", shots: 4, stills: 3, clips: 2 }
    }]
  },
  isPending: false,
  error: null
}));

jest.mock("../../../../trpc/client", () => ({
  trpc: { projects: { get: { useQuery: (input: { id: string }) => getProject(input) } } }
}));

jest.mock("../../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: <T,>(selector: (state: { openTab: jest.Mock }) => T) =>
    selector({ openTab })
}));

import ProjectDocumentsSidebar from "../ProjectDocumentsSidebar";

const renderSidebar = (projectId: string) => render(
  <ThemeProvider theme={mockTheme}>
    <ProjectDocumentsSidebar projectId={projectId} active />
  </ThemeProvider>
);

beforeEach(() => jest.clearAllMocks());

it("lists the current project's documents and opens them in that project", async () => {
  const { rerender } = renderSidebar("p1");
  expect(screen.getByRole("complementary", { name: "Project documents" })).toBeInTheDocument();
  expect(screen.getByText("Project p1")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "p1 board" }));
  expect(openTab).toHaveBeenCalledWith({
    type: "storyboard",
    ref: "p1-board",
    title: "p1 board",
    projectId: "p1"
  });

  rerender(
    <ThemeProvider theme={mockTheme}>
      <ProjectDocumentsSidebar projectId="p2" active />
    </ThemeProvider>
  );
  expect(getProject).toHaveBeenCalledWith({ id: "p2" });
  expect(screen.getByRole("button", { name: "p2 board" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "p1 board" })).not.toBeInTheDocument();
});
