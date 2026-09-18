import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import DocumentsTree from "../DocumentsTree";
import { useDocumentTreeData } from "../../../hooks/useDocumentTreeData";

const mockOpenTab = jest.fn();
const mockSetVisibility = jest.fn();
const mockOpenApplication = jest.fn();
const mockNavigate = jest.fn();
const mockUseDocumentTreeData = useDocumentTreeData as jest.Mock;

jest.mock("../../../hooks/useDocumentTreeData", () => ({
  useDocumentTreeData: jest.fn()
}));

jest.mock("../../../hooks/useOpenApplication", () => ({
  useOpenApplication: () => mockOpenApplication
}));

jest.mock("../../../stores/PanelStore", () => ({
  usePanelStore: (selector: (state: { setVisibility: jest.Mock }) => unknown) =>
    selector({ setVisibility: mockSetVisibility })
}));

jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: (
    selector: (state: {
      activeTabId: string | null;
      openTab: jest.Mock;
    }) => unknown
  ) => selector({ activeTabId: null, openTab: mockOpenTab })
}));

jest.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: "/workspace" }),
  useNavigate: () => mockNavigate
}));

jest.mock("../../entities/EntityEditorDialog", () => ({
  EntityEditorDialog: ({ entity }: { entity: { id: string; name: string } }) => (
    <div data-testid="entity-editor">Editing {entity.name}</div>
  )
}));

const renderTree = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <DocumentsTree projectId="project-a" />
    </ThemeProvider>
  );

const data = {
  groups: [
    {
      id: "workflows",
      label: "Workflows",
      children: [
        {
          id: "workflow-1",
          name: "Campaign Generator",
          type: "workflow",
          typeLabel: "Workflow",
          projectId: "project-a"
        }
      ]
    },
    {
      id: "agents",
      label: "Agents & code",
      children: [
        {
          id: "js-1",
          name: "Normalize Brief",
          type: "jsscript",
          typeLabel: "JS script",
          projectId: "project-a"
        }
      ]
    }
  ],
  isLoading: false,
  isError: false,
  error: null
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseDocumentTreeData.mockReturnValue(data);
});

it("renders only non-empty groups and gives disclosure controls to groups", () => {
  renderTree();

  expect(screen.getByRole("treeitem", { name: /Workflows/ })).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  expect(
    screen.getByRole("treeitem", { name: /^Campaign Generator Workflow$/ })
  ).not.toHaveAttribute("aria-expanded");
  expect(screen.queryByText("Creative documents")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Collapse Workflows" })
  ).toBeInTheDocument();
});

it("filters leaves by name or type and removes empty groups", async () => {
  const user = userEvent.setup();
  renderTree();

  await user.type(
    screen.getByRole("textbox", { name: "Search documents" }),
    "js script"
  );

  expect(screen.getByText("Normalize Brief")).toBeInTheDocument();
  expect(screen.queryByText("Campaign Generator")).not.toBeInTheDocument();
  expect(screen.queryByText("Workflows")).not.toBeInTheDocument();
});

it("opens a workflow using the workspace tab contract", async () => {
  const user = userEvent.setup();
  renderTree();

  await user.click(
    screen.getByRole("treeitem", { name: /^Campaign Generator Workflow$/ })
  );

  expect(mockOpenTab).toHaveBeenCalledWith({
    type: "workflow",
    ref: "workflow-1",
    mode: "edit",
    title: "Campaign Generator",
    projectId: "project-a"
  });
  expect(mockSetVisibility).toHaveBeenCalledWith(false);
});

it("opens an entity in the existing entity editor", async () => {
  const user = userEvent.setup();
  mockUseDocumentTreeData.mockReturnValue({
    ...data,
    groups: [
      {
        id: "creative",
        label: "Creative documents",
        children: [
          {
            id: "entity-1",
            name: "Mara",
            type: "entity",
            typeLabel: "Entity",
            projectId: "project-a",
            entity: {
              id: "entity-1",
              name: "Mara"
            }
          }
        ]
      }
    ]
  });
  renderTree();

  await user.click(screen.getByRole("treeitem", { name: /^Mara Entity$/ }));

  expect(screen.getByTestId("entity-editor")).toHaveTextContent("Editing Mara");
  expect(mockOpenTab).not.toHaveBeenCalled();
});

it("uses the primitive loading and error states", () => {
  mockUseDocumentTreeData.mockReturnValue({
    groups: [],
    isLoading: false,
    isError: true,
    error: new Error("Request failed")
  });
  renderTree();

  expect(screen.getByText("Could not load documents")).toBeInTheDocument();
  expect(screen.getByText("Request failed")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Report" })).toBeInTheDocument();
});
