import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import mockTheme from "../../../__mocks__/themeMock";
import WorkspaceTree from "../WorkspaceTree";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";
import { usePanelStore } from "../../../stores/PanelStore";
import { useAssetUpload } from "../../../serverState/useAssetUpload";

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

// jsdom has no layout, so the virtualized list renders every row.
jest.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 28,
        end: (index + 1) * 28,
        size: 28,
        lane: 0
      })),
    getTotalSize: () => count * 28,
    scrollToIndex: () => {}
  })
}));

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

const mockActions = {
  assetOfFile: jest.fn(),
  createFolder: jest.fn(),
  renameEntry: jest.fn(),
  deleteEntry: jest.fn(),
  moveEntry: jest.fn(),
  countFilesUnder: jest.fn()
};

jest.mock("../workspaceTreeActions", () => {
  const actual = jest.requireActual("../workspaceTreeActions");
  return {
    ...actual,
    assetOfFile: (...args: unknown[]) => mockActions.assetOfFile(...args),
    createFolder: (...args: unknown[]) => mockActions.createFolder(...args),
    renameEntry: (...args: unknown[]) => mockActions.renameEntry(...args),
    deleteEntry: (...args: unknown[]) => mockActions.deleteEntry(...args),
    moveEntry: (...args: unknown[]) => mockActions.moveEntry(...args),
    countFilesUnder: (...args: unknown[]) => mockActions.countFilesUnder(...args)
  };
});

jest.mock("../WorkspaceFilePreview", () => ({
  __esModule: true,
  default: ({ path }: { path: string }) => (
    <div data-testid="file-preview">{path}</div>
  )
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
    mockActions.assetOfFile.mockReset();
    mockActions.assetOfFile.mockResolvedValue(null);
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

  it("previews a selected file and nothing before a selection", async () => {
    renderTree();
    const row = await screen.findByText("notes.md");
    expect(screen.queryByTestId("file-preview")).not.toBeInTheDocument();
    await userEvent.click(row);
    expect(await screen.findByTestId("file-preview")).toHaveTextContent(
      "notes.md"
    );
  });

  it("does not preview a selected folder", async () => {
    listFiles.mockResolvedValue([
      { name: "prompts", path: "prompts", is_dir: true, size: 0 }
    ]);
    renderTree();
    await userEvent.click(await screen.findByText("prompts"));
    expect(screen.queryByTestId("file-preview")).not.toBeInTheDocument();
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

  describe("a media asset file", () => {
    it("opens an audio file as an audio asset tab so View/Edit is available", async () => {
      listFiles.mockResolvedValue([
        { name: "voice.wav", path: "voice.wav", is_dir: false, size: 4096 }
      ]);
      mockActions.assetOfFile.mockResolvedValue({
        id: "asset-audio-1",
        name: "voice.wav",
        content_type: "audio/wav"
      });
      usePanelStore.getState().setVisibility(true);
      renderTree();
      await userEvent.dblClick(await screen.findByText("voice.wav"));

      await waitFor(() =>
        expect(useWorkspaceTabsStore.getState().tabs).toHaveLength(1)
      );
      expect(mockActions.assetOfFile).toHaveBeenCalledWith(
        "project-a",
        "voice.wav"
      );
      expect(useWorkspaceTabsStore.getState().tabs[0]).toMatchObject({
        type: "audio",
        ref: "asset-audio-1",
        mode: "view",
        title: "voice.wav",
        projectId: "project-a"
      });
      expect(usePanelStore.getState().panel.isVisible).toBe(false);
    });

    it("opens a Markdown file in the document editor's text tab", async () => {
      listFiles.mockResolvedValue([
        { name: "notes.md", path: "notes.md", is_dir: false, size: 128 }
      ]);
      mockActions.assetOfFile.mockResolvedValue({
        id: "asset-md-1",
        name: "notes.md",
        content_type: "text/markdown"
      });
      renderTree();
      await userEvent.dblClick(await screen.findByText("notes.md"));

      await waitFor(() =>
        expect(useWorkspaceTabsStore.getState().tabs).toHaveLength(1)
      );
      expect(useWorkspaceTabsStore.getState().tabs[0]).toMatchObject({
        type: "text",
        ref: "asset-md-1",
        mode: "edit",
        projectId: "project-a"
      });
    });

    it("opens an image file as an image asset tab", async () => {
      listFiles.mockResolvedValue([
        { name: "cover.png", path: "cover.png", is_dir: false, size: 2048 }
      ]);
      mockActions.assetOfFile.mockResolvedValue({
        id: "asset-img-1",
        name: "cover.png",
        content_type: "image/png"
      });
      renderTree();
      await userEvent.dblClick(await screen.findByText("cover.png"));

      await waitFor(() =>
        expect(useWorkspaceTabsStore.getState().tabs).toHaveLength(1)
      );
      expect(useWorkspaceTabsStore.getState().tabs[0]).toMatchObject({
        type: "image",
        ref: "asset-img-1",
        mode: "view",
        title: "cover.png",
        projectId: "project-a"
      });
    });

    it("falls back to workspace-file when no asset owns the audio file", async () => {
      listFiles.mockResolvedValue([
        { name: "stray.wav", path: "stray.wav", is_dir: false, size: 1024 }
      ]);
      mockActions.assetOfFile.mockResolvedValue(null);
      renderTree();
      await userEvent.dblClick(await screen.findByText("stray.wav"));

      await waitFor(() =>
        expect(useWorkspaceTabsStore.getState().tabs).toHaveLength(1)
      );
      expect(useWorkspaceTabsStore.getState().tabs[0]).toMatchObject({
        type: "workspace-file",
        ref: "ws-a::stray.wav",
        mode: "view",
        title: "stray.wav",
        projectId: "project-a"
      });
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

    it("offers no reveal in a browser", async () => {
      renderTree();
      fireEvent.contextMenu(await screen.findByText("notes.md"));
      expect(await screen.findByRole("menu")).toBeInTheDocument();
      expect(
        screen.queryByRole("menuitem", { name: "Reveal in Finder" })
      ).not.toBeInTheDocument();
    });

    it("offers no reveal for a cloud folder, even in the desktop app", async () => {
      withDesktop("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
      renderTree("project-cloud");

      fireEvent.contextMenu(await screen.findByText("notes.md"));
      expect(await screen.findByRole("menu")).toBeInTheDocument();
      expect(
        screen.queryByRole("menuitem", { name: "Reveal in Finder" })
      ).not.toBeInTheDocument();
    });
  });
});

describe("WorkspaceTree file drop", () => {
  const uploadAsset = jest.fn();
  const original = useAssetUpload.getState().uploadAsset;

  beforeEach(() => {
    uploadAsset.mockReset();
    useAssetUpload.setState({ uploadAsset });
    listFiles.mockReset();
    listFiles.mockResolvedValue([
      { name: "footage", path: "footage", is_dir: true, size: 0 },
      { name: "notes.md", path: "notes.md", is_dir: false, size: 12 }
    ]);
  });

  afterEach(() => {
    useAssetUpload.setState({ uploadAsset: original });
  });

  const drop = (target: Element, file: File): void => {
    const dataTransfer = { types: ["Files"], files: [file], dropEffect: "none" };
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
  };

  it("uploads a file dropped on a folder into that folder of the project", async () => {
    renderTree();
    const folder = await screen.findByText("footage");
    const file = new File([new Uint8Array([1])], "take 1.mov", { type: "video/quicktime" });

    drop(folder, file);

    expect(uploadAsset).toHaveBeenCalledTimes(1);
    expect(uploadAsset).toHaveBeenCalledWith(
      expect.objectContaining({ file, project_id: "project-a", directory: "footage" })
    );
  });

  it("uploads a file dropped on a file row into the folder that file is in", async () => {
    renderTree();
    const file = new File([new Uint8Array([1])], "a.png", { type: "image/png" });

    drop(await screen.findByText("notes.md"), file);

    expect(uploadAsset).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: "project-a", directory: "." })
    );
  });

  it("ignores a drag that carries no files", async () => {
    renderTree();
    const folder = await screen.findByText("footage");
    fireEvent.drop(folder, { dataTransfer: { types: ["text/plain"], files: [] } });
    expect(uploadAsset).not.toHaveBeenCalled();
  });
});

describe("WorkspaceTree folder management", () => {
  beforeEach(() => {
    Object.values(mockActions).forEach((fn) => {
      fn.mockReset();
      fn.mockResolvedValue(undefined);
    });
    listFiles.mockReset();
    listFiles.mockImplementation(({ path }: { path: string }) =>
      Promise.resolve(
        path === "."
          ? [
              { name: "footage", path: "footage", is_dir: true, size: 0 },
              { name: "notes.md", path: "notes.md", is_dir: false, size: 12 }
            ]
          : path === "footage"
            ? [{ name: "raw", path: "footage/raw", is_dir: true, size: 0 }]
            : []
      )
    );
  });

  const openMenu = async (label: string): Promise<void> => {
    fireEvent.contextMenu(await screen.findByText(label));
    await screen.findByRole("menu");
  };

  it("creates a folder inside the folder the menu opened on", async () => {
    const client = new QueryClient();
    const invalidate = jest.spyOn(client, "invalidateQueries");
    renderTree("project-a", client);
    await openMenu("footage");
    await userEvent.click(screen.getByRole("menuitem", { name: "New folder" }));

    const input = await screen.findByLabelText("Name");
    await userEvent.clear(input);
    await userEvent.type(input, "Shots{Enter}");

    await waitFor(() =>
      expect(mockActions.createFolder).toHaveBeenCalledWith("project-a", "footage", "Shots")
    );
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["assets"] })
    );
  });

  it("creates a folder at the root from the empty area", async () => {
    renderTree();
    await screen.findByText("notes.md");
    fireEvent.contextMenu(document.querySelector(".file-tree-container") as HTMLElement);
    await userEvent.click(await screen.findByRole("menuitem", { name: "New folder" }));
    expect(screen.queryByRole("menuitem", { name: "Rename" })).not.toBeInTheDocument();

    const input = await screen.findByLabelText("Name");
    await userEvent.clear(input);
    await userEvent.type(input, "Audio{Enter}");

    await waitFor(() =>
      expect(mockActions.createFolder).toHaveBeenCalledWith("project-a", ".", "Audio")
    );
  });

  it("renames a file", async () => {
    renderTree();
    await openMenu("notes.md");
    expect(screen.queryByRole("menuitem", { name: "New folder" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: "Rename" }));

    const input = await screen.findByLabelText("Name");
    expect(input).toHaveValue("notes.md");
    await userEvent.clear(input);
    await userEvent.type(input, "plan.md{Enter}");

    await waitFor(() =>
      expect(mockActions.renameEntry).toHaveBeenCalledWith("project-a", "notes.md", false, "plan.md")
    );
  });

  it("names how many files a folder delete removes, then deletes on confirm", async () => {
    mockActions.countFilesUnder.mockResolvedValue(3);
    renderTree();
    await openMenu("footage");
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(await screen.findByText(/3 files/)).toBeInTheDocument();
    expect(mockActions.deleteEntry).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(mockActions.deleteEntry).toHaveBeenCalledWith("project-a", "footage", true)
    );
  });

  const dragEntry = (source: Element, target: Element): void => {
    const store: Record<string, string> = {};
    const dataTransfer = {
      types: [] as string[],
      setData: (type: string, value: string) => {
        store[type] = value;
        dataTransfer.types.push(type);
      },
      getData: (type: string) => store[type] ?? "",
      files: [],
      dropEffect: "none",
      effectAllowed: "all"
    };
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
  };

  it("moves a file dropped on a folder into that folder", async () => {
    renderTree();
    dragEntry(await screen.findByText("notes.md"), await screen.findByText("footage"));
    await waitFor(() =>
      expect(mockActions.moveEntry).toHaveBeenCalledWith("project-a", "notes.md", false, "footage")
    );
  });

  const startDrag = (source: Element): Record<string, string> => {
    const store: Record<string, string> = {};
    const dataTransfer = {
      types: [] as string[],
      setData: (type: string, value: string) => {
        store[type] = value;
        dataTransfer.types.push(type);
      },
      getData: (type: string) => store[type] ?? "",
      files: [],
      dropEffect: "none",
      effectAllowed: "all"
    };
    fireEvent.dragStart(source, { dataTransfer });
    return store;
  };

  it("gives a dragged media file the canvas drag payload", async () => {
    renderTree();
    const store = startDrag(await screen.findByText("notes.md"));
    expect(JSON.parse(store["application/x-nodetool-drag"])).toEqual({
      type: "project-file",
      payload: { projectId: "project-a", path: "notes.md" }
    });
  });

  it("gives a dragged folder no canvas drag payload", async () => {
    renderTree();
    const store = startDrag(await screen.findByText("footage"));
    expect(store["application/x-nodetool-drag"]).toBeUndefined();
    expect(store["application/x-nodetool-project-entry"]).toBe("footage");
  });

  it("refuses to move a folder into its own subfolder", async () => {
    renderTree();
    await userEvent.click(await screen.findByText("footage"));
    const sub = await screen.findByText("raw");

    dragEntry(screen.getByText("footage"), sub);

    expect(mockActions.moveEntry).not.toHaveBeenCalled();
  });
});
