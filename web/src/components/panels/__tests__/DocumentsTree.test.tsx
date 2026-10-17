import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

// Counts row renders: every row draws one DeleteButton.
const mockDeleteButtonRender = jest.fn();
jest.mock("../../ui_primitives/DeleteButton", () => {
  const actual = jest.requireActual("../../ui_primitives/DeleteButton");
  const { createElement } = jest.requireActual("react");
  const CountedDeleteButton = (props: Record<string, unknown>) => {
    mockDeleteButtonRender(props.ariaLabel);
    return createElement(actual.DeleteButton, props);
  };
  return { ...actual, DeleteButton: CountedDeleteButton };
});

jest.mock("../../../hooks/useDocumentTreeData", () => ({
  useDocumentTreeData: jest.fn()
}));

const mockDeleteMutate = jest.fn();
jest.mock("../../../serverState/useDeleteDocument", () => ({
  useDeleteDocument: () => ({ mutate: mockDeleteMutate })
}));

const mockDuplicateWorkflow = jest.fn(() => Promise.resolve());
jest.mock("../../../hooks/useDuplicateWorkflowDocument", () => ({
  useDuplicateWorkflowDocument: () => mockDuplicateWorkflow
}));

const mockRenameDocument = jest.fn(() => Promise.resolve());
jest.mock("../../../hooks/useRenameDocument", () => ({
  useRenameDocument: () => mockRenameDocument
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
  EntityEditorDialog: ({
    entity
  }: {
    entity: { id: string; name: string };
  }) => <div data-testid="entity-editor">Editing {entity.name}</div>
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

it.each(["timeline"] as const)(
  "opens an existing %s in view mode",
  async (type) => {
    mockUseDocumentTreeData.mockReturnValue({
      ...data,
      groups: [
        {
          id: "creative",
          label: "Creative documents",
          children: [
            {
              id: "document-1",
              name: "My document",
              type,
              typeLabel: type,
              projectId: "project-a"
            }
          ]
        }
      ]
    });
    renderTree();
    await userEvent.click(
      screen.getByRole("treeitem", { name: `My document ${type}` })
    );
    expect(mockOpenTab).toHaveBeenCalledWith(
      expect.objectContaining({ type, ref: "document-1", mode: "view" })
    );
  }
);

it("deletes a document only after the user confirms", async () => {
  const user = userEvent.setup();
  renderTree();

  await user.click(
    screen.getByRole("button", { name: "Delete Campaign Generator" })
  );
  expect(mockDeleteMutate).not.toHaveBeenCalled();
  expect(mockOpenTab).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Delete" }));

  expect(mockDeleteMutate).toHaveBeenCalledWith(
    { id: "workflow-1", type: "workflow" },
    expect.any(Object)
  );
});

it("does not delete when the user cancels", async () => {
  const user = userEvent.setup();
  renderTree();

  await user.click(
    screen.getByRole("button", { name: "Delete Normalize Brief" })
  );
  await user.click(screen.getByRole("button", { name: "Cancel" }));

  expect(mockDeleteMutate).not.toHaveBeenCalled();
});

it("says an empty project lists text files here and uploads in the Library", () => {
  mockUseDocumentTreeData.mockReturnValue({ ...data, groups: [] });
  renderTree();

  expect(screen.getByText("No documents yet")).toBeInTheDocument();
  expect(
    screen.getByText(
      "Workflows, text files and other documents created in this project will appear here. Uploads are in the Library."
    )
  ).toBeInTheDocument();
});

it("says a search with no match names Chats and the Library (study-7-I5)", async () => {
  const user = userEvent.setup();
  renderTree();

  await user.type(
    screen.getByRole("textbox", { name: "Search documents" }),
    "release"
  );

  expect(screen.getByText("No matching documents")).toBeInTheDocument();
  expect(
    screen.getByText(
      "This searches documents only. Conversations are in Chats, and uploads are in the Library."
    )
  ).toBeInTheDocument();
});

const textAndGameData = {
  ...data,
  groups: [
    {
      id: "creative",
      label: "Creative documents",
      children: [
        {
          id: "game-1",
          name: "Platformer",
          type: "game",
          typeLabel: "Game",
          projectId: "project-a"
        }
      ]
    },
    {
      id: "text",
      label: "Text files",
      children: [
        {
          id: "text-1",
          name: "Notes.md",
          type: "text",
          typeLabel: "Text file",
          projectId: "project-a"
        }
      ]
    }
  ]
};

it("lists a saved text file and opens it in its text tab (study-7-I5)", async () => {
  const user = userEvent.setup();
  mockUseDocumentTreeData.mockReturnValue(textAndGameData);
  renderTree();

  expect(screen.getByRole("treeitem", { name: /Text files/ })).toBeInTheDocument();
  await user.click(screen.getByRole("treeitem", { name: /^Notes\.md Text file$/ }));

  expect(mockOpenTab).toHaveBeenCalledWith({
    type: "text",
    ref: "text-1",
    mode: "edit",
    title: "Notes.md",
    projectId: "project-a"
  });
  expect(screen.getByRole("button", { name: "Delete Notes.md" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Rename Notes.md" })).toBeInTheDocument();
});

it("searches text files by name", async () => {
  const user = userEvent.setup();
  mockUseDocumentTreeData.mockReturnValue(textAndGameData);
  renderTree();

  await user.type(
    screen.getByRole("textbox", { name: "Search documents" }),
    "notes"
  );

  expect(screen.getByText("Notes.md")).toBeInTheDocument();
  expect(screen.queryByText("Platformer")).not.toBeInTheDocument();
});

it("opens a game in its tab and offers no delete or rename for it", async () => {
  const user = userEvent.setup();
  mockUseDocumentTreeData.mockReturnValue(textAndGameData);
  renderTree();

  await user.click(screen.getByRole("treeitem", { name: /^Platformer Game$/ }));

  expect(mockOpenTab).toHaveBeenCalledWith(
    expect.objectContaining({ type: "game", ref: "game-1" })
  );
  expect(
    screen.queryByRole("button", { name: "Delete Platformer" })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Rename Platformer" })
  ).not.toBeInTheDocument();
});

it("duplicates a workflow from its row and offers no duplicate for other kinds", async () => {
  const user = userEvent.setup();
  renderTree();

  await user.click(
    screen.getByRole("button", { name: "Duplicate Campaign Generator" })
  );

  expect(mockDuplicateWorkflow).toHaveBeenCalledWith("workflow-1", [
    "Campaign Generator"
  ]);
  expect(
    screen.queryByRole("button", { name: "Duplicate Normalize Brief" })
  ).not.toBeInTheDocument();
});

it("renames a workflow inline from its row with Enter", async () => {
  const user = userEvent.setup();
  renderTree();

  await user.click(
    screen.getByRole("button", { name: "Rename Campaign Generator" })
  );
  const input = screen.getByRole("textbox", {
    name: "Rename Campaign Generator"
  });
  await waitFor(() => expect(input).toHaveFocus());
  await user.clear(input);
  await user.type(input, "Launch Generator{Enter}");

  expect(mockRenameDocument).toHaveBeenCalledWith(
    {
      type: "workflow",
      ref: "workflow-1",
      currentName: "Campaign Generator"
    },
    "Launch Generator"
  );
  expect(mockOpenTab).not.toHaveBeenCalled();
});

it("renames a JS script and cancels a rename with Escape", async () => {
  const user = userEvent.setup();
  renderTree();

  await user.click(screen.getByRole("button", { name: "Rename Normalize Brief" }));
  let input = screen.getByRole("textbox", { name: "Rename Normalize Brief" });
  await waitFor(() => expect(input).toHaveFocus());
  await user.type(input, " v2{Escape}");
  expect(mockRenameDocument).not.toHaveBeenCalled();
  expect(
    screen.getByRole("treeitem", { name: /^Normalize Brief JS script$/ })
  ).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Rename Normalize Brief" }));
  input = screen.getByRole("textbox", { name: "Rename Normalize Brief" });
  await waitFor(() => expect(input).toHaveFocus());
  await user.type(input, "{End} v2{Enter}");
  expect(mockRenameDocument).toHaveBeenCalledWith(
    { type: "jsscript", ref: "js-1", currentName: "Normalize Brief" },
    "Normalize Brief v2"
  );
});

it("offers no rename for an entity", () => {
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
            projectId: "project-a"
          }
        ]
      }
    ]
  });
  renderTree();
  expect(screen.getByRole("button", { name: "Delete Mara" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Rename Mara" })).toBeNull();
  fireEvent.contextMenu(
    screen.getByRole("treeitem", { name: /^Mara Entity$/ })
  );
  expect(screen.queryByRole("menuitem", { name: "Rename" })).toBeNull();
});

it("renames a row from its right-click menu", async () => {
  const user = userEvent.setup();
  renderTree();

  fireEvent.contextMenu(
    screen.getByRole("treeitem", { name: /^Campaign Generator Workflow$/ }),
    { clientX: 20, clientY: 20 }
  );
  await user.click(await screen.findByRole("menuitem", { name: "Rename" }));
  const input = await screen.findByRole("textbox", {
    name: "Rename Campaign Generator"
  });
  await waitFor(() => expect(input).toHaveFocus());
  await user.clear(input);
  await user.type(input, "Menu name{Enter}");

  expect(mockRenameDocument).toHaveBeenCalledWith(
    {
      type: "workflow",
      ref: "workflow-1",
      currentName: "Campaign Generator"
    },
    "Menu name"
  );
  expect(mockOpenTab).not.toHaveBeenCalled();
});

it("opens the row menu without a pointer position, as Shift+F10 does", async () => {
  renderTree();
  fireEvent.contextMenu(
    screen.getByRole("treeitem", { name: /^Normalize Brief JS script$/ })
  );
  expect(
    await screen.findByRole("menuitem", { name: "Rename" })
  ).toBeInTheDocument();
});

// A save refetches the index. The hook keeps an unchanged document's leaf, so
// its row must not re-render; a project has hundreds of them.
it("does not re-render a row whose document a refetch did not change", () => {
  const { rerender } = renderTree();
  mockDeleteButtonRender.mockClear();

  mockUseDocumentTreeData.mockReturnValue({
    ...data,
    groups: data.groups.map((group) => ({ ...group }))
  });
  rerender(
    <ThemeProvider theme={mockTheme}>
      <DocumentsTree projectId="project-a" />
    </ThemeProvider>
  );

  expect(mockDeleteButtonRender).not.toHaveBeenCalled();
});
