import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";

interface ListedDocument {
  type: string;
  ref: string;
  name: string;
  updatedAt: string;
  file: { path: string; state: string; error: string | null } | null;
}

let listed: ListedDocument[] = [];
const documentsQuery = jest.fn();
const restoreMutate = jest.fn();
const invalidateDocuments = jest.fn();
const deleteMutate = jest.fn();

jest.mock("../../../trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      projects: { documents: { invalidate: invalidateDocuments } }
    }),
    projects: {
      documents: {
        useQuery: (input: { id: string }) => {
          documentsQuery(input);
          return { data: listed };
        }
      },
      restoreDocumentFile: {
        useMutation: (options: { onSuccess?: () => void }) => ({
          mutate: (input: unknown) => {
            restoreMutate(input);
            options.onSuccess?.();
          },
          isPending: false,
          error: null
        })
      }
    }
  }
}));

jest.mock("../../../serverState/useDeleteDocument", () => ({
  useDeleteDocument: () => ({
    mutate: deleteMutate,
    isPending: false,
    error: null
  })
}));

jest.mock("../../../hooks/useProjectFolder", () => ({
  useProjectFolder: () => ({
    folder: {
      workspace_id: "ws-film",
      path: "/home/me/NodeTool/Film",
      origin: "created",
      is_accessible: true
    },
    projectName: "Film",
    isLoading: false
  })
}));

import DocumentFileNotice from "../DocumentFileNotice";

const workflow = (file: ListedDocument["file"]): ListedDocument => ({
  type: "workflow",
  ref: "wf-1",
  name: "Fox",
  updatedAt: "2026-11-15T00:00:00Z",
  file
});

const renderNotice = (
  props: { type?: "workflow" | "timeline"; projectId?: string } = {}
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <DocumentFileNotice
        type={props.type ?? "workflow"}
        refId="wf-1"
        projectId={"projectId" in props ? props.projectId : "film"}
      />
    </ThemeProvider>
  );

describe("DocumentFileNotice", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listed = [];
    useWorkspaceTabsStore.setState({
      tabs: [],
      activeTabId: null,
      personalProjectId: "personal:1"
    });
  });

  it("shows nothing while the file matches the document", () => {
    listed = [
      workflow({ path: "Workflows/Fox.workflow.json", state: "ok", error: null })
    ];
    const { container } = renderNotice();
    expect(container).toBeEmptyDOMElement();
    expect(documentsQuery).toHaveBeenCalledWith({ id: "film" });
  });

  it("shows the error of an invalid file and opens the file", async () => {
    listed = [
      workflow({
        path: "Workflows/Fox.workflow.json",
        state: "invalid",
        error: '"tags" must be a list of strings'
      })
    ];
    renderNotice();

    expect(screen.getByText("This file has an error")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Workflows\/Fox\.workflow\.json was not loaded: "tags" must be a list of strings\. The last valid version stays open and still runs\./
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Open file" }));
    const { tabs } = useWorkspaceTabsStore.getState();
    expect(tabs).toEqual([
      expect.objectContaining({
        type: "workspace-file",
        ref: "ws-film::Workflows/Fox.workflow.json",
        title: "Fox.workflow.json",
        projectId: "film"
      })
    ]);
  });

  it("shows File missing with Restore, which rewrites the file", async () => {
    listed = [
      workflow({
        path: "Workflows/Fox.workflow.json",
        state: "missing",
        error: "File missing"
      })
    ];
    renderNotice();

    expect(screen.getByText("File missing")).toBeInTheDocument();
    expect(
      screen.getByText(/Workflows\/Fox\.workflow\.json is no longer in the project folder/)
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open file" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(restoreMutate).toHaveBeenCalledWith({ type: "workflow", ref: "wf-1" });
    expect(invalidateDocuments).toHaveBeenCalledWith({ id: "film" });
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it("deletes a document whose file is missing only after the user confirms", async () => {
    listed = [
      {
        ...workflow({
          path: "Timelines/Cut.timeline.json",
          state: "missing",
          error: "File missing"
        }),
        type: "timeline"
      }
    ];
    renderNotice({ type: "timeline" });

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteMutate).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Delete Cut.timeline.json?")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(deleteMutate).toHaveBeenCalledWith({ id: "wf-1", type: "timeline" });
    expect(restoreMutate).not.toHaveBeenCalled();
  });

  it("reads a loose document's file from Personal", () => {
    listed = [];
    renderNotice({ projectId: undefined });
    expect(documentsQuery).toHaveBeenCalledWith({ id: "personal:1" });
  });
});
