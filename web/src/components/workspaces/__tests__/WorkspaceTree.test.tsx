import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import mockTheme from "../../../__mocks__/themeMock";
import WorkspaceTree from "../WorkspaceTree";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";
import { usePanelStore } from "../../../stores/PanelStore";

interface FolderState {
  folder: {
    workspace_id: string;
    path: string | null;
    origin: "created" | "adopted";
    is_accessible: boolean;
  } | null;
  projectName: string | null;
  isLoading: boolean;
}

// One folder per project, as the project API reports it.
const folders: Record<string, FolderState> = {
  "project-a": {
    folder: {
      workspace_id: "ws-a",
      path: "/home/me/NodeTool/Film A",
      origin: "created",
      is_accessible: true
    },
    projectName: "Film A",
    isLoading: false
  },
  "project-b": {
    folder: {
      workspace_id: "ws-b",
      path: "/home/me/NodeTool/Film B",
      origin: "created",
      is_accessible: true
    },
    projectName: "Film B",
    isLoading: false
  },
  "project-cloud": {
    folder: {
      workspace_id: "ws-cloud",
      path: null,
      origin: "created",
      is_accessible: true
    },
    projectName: "Cloud film",
    isLoading: false
  },
  "project-none": { folder: null, projectName: "No folder", isLoading: false }
};

const listFiles = jest.fn();
const documentByFile = jest.fn();

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    workspace: {
      listFiles: { query: (input: unknown) => listFiles(input) }
    },
    projects: {
      documentByFile: { query: (input: unknown) => documentByFile(input) }
    }
  }
}));

jest.mock("../../../hooks/useProjectFolder", () => ({
  useProjectFolder: (projectId: string) => folders[projectId]
}));

// No WorkflowManagerProvider and no workflow: the tree lists the project's
// folder without one.
const renderTree = (projectId = "project-a", client = new QueryClient()) => {
  const tree = (id: string) => (
    <QueryClientProvider client={client}>
      <ThemeProvider theme={mockTheme}>
        <WorkspaceTree projectId={id} />
      </ThemeProvider>
    </QueryClientProvider>
  );
  const view = render(tree(projectId));
  return { ...view, switchProject: (id: string) => view.rerender(tree(id)) };
};

describe("WorkspaceTree", () => {
  beforeEach(() => {
    listFiles.mockReset();
    documentByFile.mockReset();
    documentByFile.mockResolvedValue(null);
    listFiles.mockResolvedValue([
      { name: "notes.md", path: "notes.md", is_dir: false, size: 12 }
    ]);
    useWorkspaceTabsStore.setState({ tabs: [], activeTabId: null });
  });

  it("lists the files of the project's folder", async () => {
    renderTree();
    expect(await screen.findByText("notes.md")).toBeInTheDocument();
    expect(listFiles).toHaveBeenCalledWith({ id: "ws-a", path: "." });
  });

  it("offers no workspace picker or manage button", async () => {
    renderTree();
    await screen.findByText("notes.md");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText(/workspace/i)).not.toBeInTheDocument();
    expect(screen.getByText("Files")).toBeInTheDocument();
  });

  it("follows the selected project to its own folder", async () => {
    listFiles.mockImplementation(({ id }: { id: string }) =>
      Promise.resolve(
        id === "ws-a"
          ? [{ name: "a.md", path: "a.md", is_dir: false, size: 1 }]
          : [{ name: "b.md", path: "b.md", is_dir: false, size: 1 }]
      )
    );
    const { switchProject } = renderTree("project-a");
    expect(await screen.findByText("a.md")).toBeInTheDocument();

    switchProject("project-b");

    expect(await screen.findByText("b.md")).toBeInTheDocument();
    expect(screen.queryByText("a.md")).not.toBeInTheDocument();
    expect(listFiles).toHaveBeenCalledWith({ id: "ws-b", path: "." });
  });

  it("hides .nodetool at the folder root", async () => {
    listFiles.mockResolvedValue([
      { name: ".nodetool", path: ".nodetool", is_dir: true, size: 0 },
      { name: "footage", path: "footage", is_dir: true, size: 0 },
      { name: "notes.md", path: "notes.md", is_dir: false, size: 12 }
    ]);
    renderTree();

    expect(await screen.findByText("notes.md")).toBeInTheDocument();
    expect(screen.getByText("footage")).toBeInTheDocument();
    expect(screen.queryByText(".nodetool")).not.toBeInTheDocument();
  });

  it("shows a file the agent wrote when the workspace reports a change", async () => {
    const client = new QueryClient();
    renderTree("project-a", client);
    await screen.findByText("notes.md");

    listFiles.mockResolvedValue([
      { name: "notes.md", path: "notes.md", is_dir: false, size: 12 },
      { name: "fox.png", path: "Generated/fox.png", is_dir: false, size: 99 }
    ]);
    // What `handleResourceChange` does for a `workspacefile` update.
    await client.invalidateQueries({ queryKey: ["workspace-files", "ws-a"] });

    expect(await screen.findByText("fox.png")).toBeInTheDocument();
  });

  it("says so when the project has no folder", async () => {
    renderTree("project-none");
    expect(await screen.findByText("No project folder")).toBeInTheDocument();
    expect(listFiles).not.toHaveBeenCalled();
  });

  it("opens a double-clicked file as a workspace-file tab", async () => {
    usePanelStore.getState().setVisibility(true);
    renderTree();
    await userEvent.dblClick(await screen.findByText("notes.md"));

    const tab = useWorkspaceTabsStore
      .getState()
      .tabs.find((t) => t.type === "workspace-file");
    expect(tab).toMatchObject({
      type: "workspace-file",
      ref: "ws-a::notes.md",
      mode: "view",
      title: "notes.md",
      projectId: "project-a"
    });
    // The left panel steps aside for the file it just opened.
    expect(usePanelStore.getState().panel.isVisible).toBe(false);
  });

  describe("a workflow or timeline file", () => {
    const documentFiles = [
      { name: "Fox.workflow.json", path: "Fox.workflow.json", is_dir: false, size: 120 },
      { name: "Cut.timeline.json", path: "Cut.timeline.json", is_dir: false, size: 90 },
      { name: "Stray.workflow.json", path: "Stray.workflow.json", is_dir: false, size: 3 }
    ];
    const file = { state: "ok", error: null };

    beforeEach(() => {
      listFiles.mockResolvedValue(documentFiles);
      documentByFile.mockImplementation(({ path }: { path: string }) =>
        Promise.resolve(
          path === "Fox.workflow.json"
            ? { type: "workflow", ref: "wf-fox", name: "Fox", updatedAt: "", file: { ...file, path } }
            : path === "Cut.timeline.json"
              ? { type: "timeline", ref: "tl-cut", name: "Cut", updatedAt: "", file: { ...file, path } }
              : null
        )
      );
    });

    it("opens the workflow editor on its workflow, not a JSON view", async () => {
      usePanelStore.getState().setVisibility(true);
      renderTree();
      await userEvent.dblClick(await screen.findByText("Fox.workflow.json"));

      await waitFor(() =>
        expect(useWorkspaceTabsStore.getState().tabs).toHaveLength(1)
      );
      expect(documentByFile).toHaveBeenCalledWith({
        id: "project-a",
        path: "Fox.workflow.json"
      });
      expect(useWorkspaceTabsStore.getState().tabs[0]).toMatchObject({
        type: "workflow",
        ref: "wf-fox",
        mode: "edit",
        title: "Fox",
        projectId: "project-a"
      });
      expect(usePanelStore.getState().panel.isVisible).toBe(false);
    });

    it("opens the timeline editor on its timeline", async () => {
      renderTree();
      await userEvent.dblClick(await screen.findByText("Cut.timeline.json"));

      await waitFor(() =>
        expect(useWorkspaceTabsStore.getState().tabs).toHaveLength(1)
      );
      expect(useWorkspaceTabsStore.getState().tabs[0]).toMatchObject({
        type: "timeline",
        ref: "tl-cut",
        projectId: "project-a"
      });
    });

    it("opens a file no document owns as a file", async () => {
      renderTree();
      await userEvent.dblClick(await screen.findByText("Stray.workflow.json"));

      await waitFor(() =>
        expect(useWorkspaceTabsStore.getState().tabs).toHaveLength(1)
      );
      expect(useWorkspaceTabsStore.getState().tabs[0]).toMatchObject({
        type: "workspace-file",
        ref: "ws-a::Stray.workflow.json"
      });
    });

    it("does not look up the document of any other file", async () => {
      listFiles.mockResolvedValue([
        { name: "notes.md", path: "notes.md", is_dir: false, size: 12 }
      ]);
      renderTree();
      await userEvent.dblClick(await screen.findByText("notes.md"));

      await waitFor(() =>
        expect(useWorkspaceTabsStore.getState().tabs).toHaveLength(1)
      );
      expect(documentByFile).not.toHaveBeenCalled();
    });
  });

  it("re-lists open folders on refresh, so a file written into one appears", async () => {
    // Root holds a folder; the folder holds one file until the refresh, two
    // after — the shape of an agent writing into a subfolder while the tree is
    // open on it.
    let promptsHasSecondFile = false;
    listFiles.mockImplementation((input: { path: string }) => {
      if (input.path === ".") {
        return Promise.resolve([
          { name: "prompts", path: "prompts", is_dir: true, size: 0 }
        ]);
      }
      return Promise.resolve(
        promptsHasSecondFile
          ? [
              { name: "one.md", path: "prompts/one.md", is_dir: false, size: 1 },
              { name: "two.md", path: "prompts/two.md", is_dir: false, size: 1 }
            ]
          : [{ name: "one.md", path: "prompts/one.md", is_dir: false, size: 1 }]
      );
    });

    renderTree();
    await userEvent.click(await screen.findByText("prompts"));
    expect(await screen.findByText("one.md")).toBeInTheDocument();

    promptsHasSecondFile = true;
    await userEvent.click(screen.getByRole("button", { name: /refresh/i }));

    expect(await screen.findByText("two.md")).toBeInTheDocument();
    // The open folder keeps its contents rather than falling back to the
    // placeholder the refetched root carries.
    expect(screen.getByText("one.md")).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  describe("reveal in the file manager", () => {
    const showItemInFolder = jest.fn().mockResolvedValue(undefined);
    let userAgent: jest.SpyInstance;

    const withDesktop = (agent: string) => {
      userAgent = jest
        .spyOn(window.navigator, "userAgent", "get")
        .mockReturnValue(agent);
      (window as unknown as { api?: unknown }).api = { showItemInFolder };
    };

    beforeEach(() => showItemInFolder.mockClear());
    afterEach(() => {
      userAgent?.mockRestore();
      delete (window as unknown as { api?: unknown }).api;
    });

    it("reveals a file from the context menu, named for macOS", async () => {
      withDesktop("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
      renderTree();

      fireEvent.contextMenu(await screen.findByText("notes.md"));
      await userEvent.click(
        await screen.findByRole("menuitem", { name: "Reveal in Finder" })
      );

      expect(showItemInFolder).toHaveBeenCalledWith(
        "/home/me/NodeTool/Film A/notes.md"
      );
    });

    it("reveals the project folder from the empty area, named for Windows", async () => {
      withDesktop("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
      renderTree();
      await screen.findByText("notes.md");

      fireEvent.contextMenu(
        document.querySelector(".file-tree-container") as HTMLElement
      );
      await userEvent.click(
        await screen.findByRole("menuitem", { name: "Show in File Explorer" })
      );

      expect(showItemInFolder).toHaveBeenCalledWith(
        "/home/me/NodeTool/Film A"
      );
    });

    it("has no menu in a browser", async () => {
      renderTree();
      fireEvent.contextMenu(await screen.findByText("notes.md"));
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("has no menu for a cloud folder, even in the desktop app", async () => {
      withDesktop("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
      renderTree("project-cloud");

      fireEvent.contextMenu(await screen.findByText("notes.md"));
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });
});
