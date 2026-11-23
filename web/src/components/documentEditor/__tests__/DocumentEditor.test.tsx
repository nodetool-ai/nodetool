import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { trpcClient } from "../../../trpc/client";
import { useAssetStore } from "../../../stores/AssetStore";
import { useDocumentProposalStore } from "../../../stores/DocumentProposalStore";
import { initKeyListeners } from "../../../stores/KeyPressedStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { handleDocumentResourceChange } from "../../../stores/documentSync";
import type { Asset } from "../../../stores/ApiTypes";
import { DOCUMENT_DISPLAY_PREFS_STORAGE_KEY } from "../DocumentDisplayControls";
import DocumentEditor from "../DocumentEditor";

const renameDocumentMock = jest.fn(async () => {});

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    assets: { update: { mutate: jest.fn() } },
    textDocuments: {
      versions: { query: jest.fn() },
      version: { query: jest.fn() },
      createVersion: { mutate: jest.fn() },
      renameVersion: { mutate: jest.fn() },
      deleteVersion: { mutate: jest.fn() },
      restore: { mutate: jest.fn() },
      export: { mutate: jest.fn() },
      exportGoogleDoc: { mutate: jest.fn() }
    },
    workspace: {
      listFiles: { query: jest.fn() }
    }
  }
}));
jest.mock("../../../stores/AssetStore", () => ({
  useAssetStore: { getState: jest.fn() }
}));
jest.mock("../../../queryClient", () => ({
  queryClient: {
    setQueryData: jest.fn(),
    invalidateQueries: jest.fn()
  }
}));
jest.mock("../../../hooks/useRenameDocument", () => ({
  useRenameDocument: () => renameDocumentMock
}));
jest.mock("../../../hooks/useProjectFolder", () => ({
  useProjectFolder: () => ({
    folder: { workspace_id: "ws-1" },
    projectName: "Test Project",
    isLoading: false
  })
}));
jest.mock("../../workspace/MonacoPane", () => ({
  __esModule: true,
  default: ({
    value,
    onChange,
    onSave
  }: {
    value: string;
    onChange: (next: string) => void;
    onSave?: () => void;
  }) => (
    <textarea
      aria-label="markdown source"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          onSave?.();
        }
      }}
    />
  )
}));
jest.mock("../../textEditor/CodeHighlightPlugin", () => ({
  CodeHighlightPlugin: () => null
}));
jest.mock("../DocumentAgentPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="document-agent-panel">assistant panel</div>
}));

const SOURCE = "# Launch notes\n\n- [ ] write the plan\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n";

const SNAPSHOT_VERSIONS = [
  {
    version: 2,
    name: "Second draft",
    save_type: "manual",
    created_at: "2026-01-02T12:00:00.000Z"
  },
  {
    version: 1,
    name: "Initial draft",
    save_type: "agent_turn",
    created_at: "2026-01-01T12:00:00.000Z"
  }
];

const SNAPSHOT_CONTENT: Record<number, string> = {
  2: "# Snapshot Two\n\nLatest saved passage.",
  1: "# Snapshot One\n\nEarlier saved passage."
};

const asset = {
  id: "doc-1",
  name: "notes.md",
  content_type: "text/markdown",
  project_id: "p1",
  workspace_path: "docs/notes.md",
  updated_at: "2026-01-01T00:00:00.000Z",
  metadata: {},
  get_url: "http://test/doc-1"
} as unknown as Asset;

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.removeItem(DOCUMENT_DISPLAY_PREFS_STORAGE_KEY);
  useDocumentProposalStore.setState({
    directApply: false,
    proposals: {},
    queuedProposals: {}
  });
  useNotificationStore.getState().clearNotifications();
  renameDocumentMock.mockClear();

  (useAssetStore.getState as jest.Mock).mockReturnValue({
    get: jest.fn(async () => asset),
    add: jest.fn()
  });
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => SOURCE
  })) as unknown as typeof fetch;

  (trpcClient.assets.update.mutate as jest.Mock).mockReset();
  (trpcClient.assets.update.mutate as jest.Mock).mockResolvedValue({
    ...asset,
    updated_at: "2026-01-01T00:01:00.000Z"
  });

  (trpcClient.textDocuments.versions.query as jest.Mock).mockReset();
  (trpcClient.textDocuments.versions.query as jest.Mock).mockResolvedValue({
    versions: SNAPSHOT_VERSIONS
  });

  (trpcClient.textDocuments.version.query as jest.Mock).mockReset();
  (trpcClient.textDocuments.version.query as jest.Mock).mockImplementation(
    async ({ version }: { version: number }) => ({
      version,
      content: SNAPSHOT_CONTENT[version] ?? ""
    })
  );

  (trpcClient.textDocuments.createVersion.mutate as jest.Mock).mockReset();
  (trpcClient.textDocuments.createVersion.mutate as jest.Mock).mockResolvedValue({
    version: 3
  });

  (trpcClient.textDocuments.renameVersion.mutate as jest.Mock).mockReset();
  (trpcClient.textDocuments.renameVersion.mutate as jest.Mock).mockResolvedValue({});

  (trpcClient.textDocuments.deleteVersion.mutate as jest.Mock).mockReset();
  (trpcClient.textDocuments.deleteVersion.mutate as jest.Mock).mockResolvedValue({});

  (trpcClient.textDocuments.restore.mutate as jest.Mock).mockReset();
  (trpcClient.textDocuments.restore.mutate as jest.Mock).mockResolvedValue({});

  (trpcClient.textDocuments.export.mutate as jest.Mock).mockReset();
  (trpcClient.textDocuments.export.mutate as jest.Mock).mockResolvedValue({
    asset_id: "export-1",
    name: "Launch brief.pdf",
    path: "exports/Launch brief.pdf"
  });

  (trpcClient.workspace.listFiles.query as jest.Mock).mockReset();
  (trpcClient.workspace.listFiles.query as jest.Mock).mockResolvedValue([
    { name: "exports", path: "exports", is_dir: true, size: 0 },
    { name: "docs", path: "docs", is_dir: true, size: 0 }
  ]);
});

const renderEditor = () => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={mockTheme}>
        <DocumentEditor asset={asset} />
      </ThemeProvider>
    </QueryClientProvider>
  );
};

describe("DocumentEditor", () => {
  it("shows the file formatted: heading, task and table", async () => {
    renderEditor();
    expect(await screen.findByRole("heading", { name: "Launch notes" })).toBeInTheDocument();
    expect(screen.getByText("write the plan")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("shows the same file as Markdown in the Markdown view", async () => {
    renderEditor();
    await screen.findByRole("heading", { name: "Launch notes" });
    await userEvent.click(screen.getByRole("button", { name: "Markdown" }));
    await waitFor(() =>
      expect(screen.getByLabelText("markdown source")).toHaveValue(SOURCE)
    );
  });

  it("renders Default Mode with two panels, clickable title header, and display controls without snapshot panes", async () => {
    const user = userEvent.setup();
    const { container } = renderEditor();

    await screen.findByRole("heading", { name: "Launch notes" });

    // Two panels: document editor + AI assistant; no snapshot viewer or snapshot list.
    expect(screen.getByTestId("document-agent-panel")).toBeInTheDocument();
    expect(screen.queryByLabelText("Snapshot preview")).toBeNull();
    expect(screen.queryByText("No snapshot selected")).toBeNull();
    expect(
      screen.queryByRole("separator", { name: "Resize snapshots list and assistant" })
    ).toBeNull();

    // Top bar has Snapshot, Open Snapshots, and Save As actions.
    expect(screen.getByRole("button", { name: "Snapshot" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open Snapshots" })
    ).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Save As" })).toBeInTheDocument();

    // Clickable title header renames file with preserved .md extension.
    await user.click(screen.getByRole("button", { name: "Rename document notes" }));
    const titleInput = screen.getByLabelText("Document title");
    await user.clear(titleInput);
    await user.type(titleInput, "Release plan{Enter}");
    expect(renameDocumentMock).toHaveBeenCalledWith(
      { type: "text", ref: "doc-1", currentName: "notes.md" },
      "Release plan.md"
    );

    // Zoom and paper theme update .doc-scroll presentation without mutating file.
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    const scrollEl = container.querySelector(".doc-scroll") as HTMLElement;
    expect(scrollEl.style.getPropertyValue("--doc-zoom")).toBe("1.1");

    await user.click(screen.getByRole("button", { name: "Paper theme" }));
    await user.click(screen.getByRole("menuitemradio", { name: "White paper" }));
    expect(scrollEl).toHaveClass("doc-paper-white");
  });

  it("saves a manual snapshot without opening Snapshots Mode", async () => {
    const user = userEvent.setup();
    renderEditor();

    await screen.findByRole("heading", { name: "Launch notes" });
    await user.click(screen.getByRole("button", { name: "Snapshot" }));

    await waitFor(() => {
      expect(trpcClient.textDocuments.createVersion.mutate).toHaveBeenCalledWith({
        asset_id: "doc-1",
        save_type: "manual",
        name: undefined
      });
    });

    expect(
      useNotificationStore
        .getState()
        .notifications.some(
          (n) => n.type === "success" && n.content === "Snapshot saved"
        )
    ).toBe(true);

    // Remains in Default Mode.
    expect(screen.getByRole("button", { name: "Open Snapshots" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Snapshot preview")).toBeNull();
  });

  it("saves a manual snapshot on Cmd+S / Ctrl+S in both formatted and markdown views, and ignores inert tabs", async () => {
    const releaseKeys = initKeyListeners();
    try {
      const user = userEvent.setup();
      const { container } = renderEditor();

      await screen.findByRole("heading", { name: "Launch notes" });

      // Cmd+S via global key listener takes a single manual snapshot.
      fireEvent.keyDown(window, { key: "s", code: "KeyS", metaKey: true });
      fireEvent.keyUp(window, { key: "s", code: "KeyS", metaKey: false });

      await waitFor(() => {
        expect(trpcClient.textDocuments.createVersion.mutate).toHaveBeenCalledTimes(1);
        expect(trpcClient.textDocuments.createVersion.mutate).toHaveBeenCalledWith({
          asset_id: "doc-1",
          save_type: "manual",
          name: undefined
        });
      });

      // Switch to Markdown view and trigger Cmd+S inside MonacoPane.
      (trpcClient.textDocuments.createVersion.mutate as jest.Mock).mockClear();
      await user.click(screen.getByRole("button", { name: "Markdown" }));
      const markdownArea = await screen.findByLabelText("markdown source");
      fireEvent.keyDown(markdownArea, { key: "s", code: "KeyS", metaKey: true });
      fireEvent.keyUp(markdownArea, { key: "s", code: "KeyS", metaKey: false });

      await waitFor(() => {
        expect(trpcClient.textDocuments.createVersion.mutate).toHaveBeenCalledTimes(1);
        expect(trpcClient.textDocuments.createVersion.mutate).toHaveBeenCalledWith({
          asset_id: "doc-1",
          save_type: "manual",
          name: undefined
        });
      });

      // Background workspace tabs marked inert do not intercept Ctrl+S.
      (trpcClient.textDocuments.createVersion.mutate as jest.Mock).mockClear();
      container.setAttribute("inert", "");
      fireEvent.keyDown(window, { key: "s", code: "KeyS", ctrlKey: true });
      fireEvent.keyUp(window, { key: "s", code: "KeyS", ctrlKey: false });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(trpcClient.textDocuments.createVersion.mutate).not.toHaveBeenCalled();
    } finally {
      releaseKeys();
    }
  });

  it("toggles into three-panel Snapshots Mode and returns cleanly to two-panel Default Mode", async () => {
    const user = userEvent.setup();
    renderEditor();

    await screen.findByRole("heading", { name: "Launch notes" });

    // Enter Snapshots Mode.
    await user.click(screen.getByRole("button", { name: "Open Snapshots" }));

    const closeButton = screen.getByRole("button", { name: "Close Snapshots" });
    expect(closeButton).toHaveAttribute("aria-pressed", "true");

    // Left panel remains editable.
    const liveEditor = screen.getByLabelText("notes.md");
    expect(liveEditor).toHaveAttribute("contenteditable", "true");

    // Center panel renders the newest snapshot read-only.
    expect(
      await screen.findByRole("heading", { name: "Snapshot Two" })
    ).toBeInTheDocument();
    expect(screen.getByText("Latest saved passage.")).toBeInTheDocument();
    const viewerInput = screen.getByLabelText("Snapshot preview");
    expect(viewerInput).toHaveAttribute("contenteditable", "false");
    expect(screen.getByText("Read-only")).toBeInTheDocument();

    // Right panel has Snapshot List, horizontal ResizeHandle, and AI Assistant.
    expect(screen.getByText("Snapshots")).toBeInTheDocument();
    expect(screen.getByText("Initial draft")).toBeInTheDocument();
    const splitHandle = screen.getByRole("separator", {
      name: "Resize snapshots list and assistant"
    });
    expect(splitHandle).toHaveAttribute("aria-orientation", "horizontal");
    expect(splitHandle).toHaveAttribute("aria-valuenow", "260");
    expect(screen.getByTestId("document-agent-panel")).toBeInTheDocument();

    // Resizing the horizontal separator updates value and persists to localStorage.
    fireEvent.keyDown(splitHandle, { key: "ArrowDown" });
    expect(splitHandle).toHaveAttribute("aria-valuenow", "276");
    expect(
      window.localStorage.getItem("nodetool.documentSnapshotsSplitHeight")
    ).toBe("276");

    // Selecting an older snapshot updates the center viewer.
    await user.click(screen.getByText("Initial draft"));
    expect(
      await screen.findByRole("heading", { name: "Snapshot One" })
    ).toBeInTheDocument();
    expect(screen.getByText("Earlier saved passage.")).toBeInTheDocument();

    // Exit Snapshots Mode back to two-panel Default Mode.
    await user.click(closeButton);
    expect(screen.getByRole("button", { name: "Open Snapshots" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Snapshot preview")).toBeNull();
    expect(
      screen.queryByRole("separator", { name: "Resize snapshots list and assistant" })
    ).toBeNull();
    expect(screen.getByTestId("document-agent-panel")).toBeInTheDocument();
  });

  it("reviews, edits, accepts, and rejects staged assistant proposals", async () => {
    const user = userEvent.setup();
    renderEditor();

    await screen.findByRole("heading", { name: "Launch notes" });

    // Stage a proposal in DocumentProposalStore.
    const proposed = "# Launch notes\n\nProposed summary paragraph.\n";
    act(() => {
      useDocumentProposalStore.getState().setProposal({
        proposalId: "prop-1",
        assetId: "doc-1",
        threadId: "thread-1",
        turnId: "turn-1",
        baseContent: SOURCE,
        proposedContent: proposed,
        draftContent: proposed,
        receivedAt: 1700000000000
      });
    });

    expect(await screen.findByText("Assistant proposed changes")).toBeInTheDocument();

    // Edit proposed text before accepting.
    await user.click(screen.getByRole("button", { name: "Edit proposed version" }));
    const proposalEditor = screen.getByLabelText("Edit proposed version");
    await user.clear(proposalEditor);
    const editedApproved = "# Approved heading\n\nUser-refined text.\n";
    await user.type(proposalEditor, editedApproved);

    await user.click(screen.getByRole("button", { name: "Accept" }));

    // Records a pre-turn version, applies the approved text, flushes, and clears proposal.
    await waitFor(() => {
      expect(trpcClient.textDocuments.createVersion.mutate).toHaveBeenCalledWith({
        asset_id: "doc-1",
        save_type: "agent_turn"
      });
      expect(trpcClient.assets.update.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "doc-1",
          data: editedApproved
        })
      );
      expect(useDocumentProposalStore.getState().proposals["doc-1"]).toBeUndefined();
    });

    expect(
      await screen.findByRole("heading", { name: "Approved heading" })
    ).toBeInTheDocument();
    expect(screen.getByText("User-refined text.")).toBeInTheDocument();
    expect(screen.queryByText("Assistant proposed changes")).toBeNull();

    // Rejecting a proposal clears it without saving a version or changing document text.
    (trpcClient.textDocuments.createVersion.mutate as jest.Mock).mockClear();
    (trpcClient.assets.update.mutate as jest.Mock).mockClear();

    act(() => {
      useDocumentProposalStore.getState().setProposal({
        proposalId: "prop-2",
        assetId: "doc-1",
        threadId: "thread-1",
        turnId: "turn-2",
        baseContent: editedApproved,
        proposedContent: "# Should not apply\n",
        draftContent: "# Should not apply\n",
        receivedAt: 1700000001000
      });
    });

    expect(await screen.findByText("Assistant proposed changes")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reject" }));

    expect(useDocumentProposalStore.getState().proposals["doc-1"]).toBeUndefined();
    expect(screen.queryByText("Assistant proposed changes")).toBeNull();
    expect(screen.getByRole("heading", { name: "Approved heading" })).toBeInTheDocument();
    expect(trpcClient.textDocuments.createVersion.mutate).not.toHaveBeenCalled();
    expect(trpcClient.assets.update.mutate).not.toHaveBeenCalled();
  });

  it("opens Save As dialog and exports with chosen format, directory, and filename", async () => {
    const user = userEvent.setup();
    renderEditor();

    await screen.findByRole("heading", { name: "Launch notes" });

    await user.click(screen.getByRole("button", { name: "Save As" }));

    expect(await screen.findByText("Save as")).toBeInTheDocument();
    const filenameInput = screen.getByLabelText("Filename");
    expect(filenameInput).toHaveValue("notes");
    expect(screen.getByLabelText("Destination folder")).toHaveValue("docs");

    // Pick destination folder from workspace listing.
    await user.click(await screen.findByText("exports"));
    expect(screen.getByLabelText("Destination folder")).toHaveValue("exports");

    // Edit filename and pick PDF format.
    await user.clear(filenameInput);
    await user.type(filenameInput, "Launch brief");
    await user.click(screen.getByRole("combobox", { name: "Format" }));
    await user.click(screen.getByRole("option", { name: "PDF (.pdf)" }));

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(trpcClient.textDocuments.export.mutate).toHaveBeenCalledWith({
        asset_id: "doc-1",
        format: "pdf",
        directory: "exports",
        name: "Launch brief"
      });
    });

    await waitFor(() => {
      expect(screen.queryByText("Save as")).toBeNull();
    });
  });

  it("confirms snapshot restore from context menu, supports Cancel, and updates editor content on Restore", async () => {
    const user = userEvent.setup();
    let serverContent = SOURCE;
    let serverUpdatedAt: string =
      asset.updated_at ?? "2026-01-01T00:00:00.000Z";

    (useAssetStore.getState as jest.Mock).mockReturnValue({
      get: jest.fn(async () => ({ ...asset, updated_at: serverUpdatedAt })),
      add: jest.fn()
    });
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => serverContent
    })) as unknown as typeof fetch;

    renderEditor();
    await screen.findByRole("heading", { name: "Launch notes" });

    // Open Snapshots Mode.
    await user.click(screen.getByRole("button", { name: "Open Snapshots" }));
    const initialDraftItem = await screen.findByText("Initial draft");

    // Right-click snapshot -> Restore -> Cancel does not restore.
    fireEvent.contextMenu(initialDraftItem);
    await user.click(await screen.findByRole("menuitem", { name: "Restore" }));

    expect(await screen.findByText("Restore snapshot")).toBeInTheDocument();
    expect(
      screen.getByText(/Restore Initial draft as the current document/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByText("Restore snapshot")).toBeNull();
    });
    expect(trpcClient.textDocuments.restore.mutate).not.toHaveBeenCalled();
    expect(screen.getByLabelText("notes.md")).toHaveTextContent("Launch notes");

    // Right-click again -> Restore -> confirm calls restoreVersion and updates editor content.
    fireEvent.contextMenu(initialDraftItem);
    await user.click(await screen.findByRole("menuitem", { name: "Restore" }));
    expect(await screen.findByText("Restore snapshot")).toBeInTheDocument();

    (trpcClient.textDocuments.restore.mutate as jest.Mock).mockImplementationOnce(
      async () => {
        serverContent = SNAPSHOT_CONTENT[1];
        serverUpdatedAt = "2026-01-01T00:05:00.000Z";
        return {};
      }
    );

    await user.click(screen.getByRole("button", { name: "Restore" }));

    await waitFor(() => {
      expect(trpcClient.textDocuments.restore.mutate).toHaveBeenCalledWith({
        asset_id: "doc-1",
        version: 1
      });
    });

    // Backend broadcasts resource_change after restore; Lexical editor DOM reloads cleanly with no change marks.
    act(() => {
      handleDocumentResourceChange("asset", {
        event: "updated",
        id: "doc-1",
        updatedAt: serverUpdatedAt
      });
    });

    const liveEditor = screen.getByLabelText("notes.md");
    await waitFor(() => {
      expect(
        within(liveEditor).getByRole("heading", { name: "Snapshot One" })
      ).toBeInTheDocument();
      expect(
        within(liveEditor).getByText("Earlier saved passage.")
      ).toBeInTheDocument();
    });
    expect(
      liveEditor.querySelector(".doc-change-modified, .doc-change-inserted")
    ).toBeNull();
    expect(screen.queryByText(/Marked changes/i)).toBeNull();
  });

  it("clears own-write suppression when snapshot restore fails so subsequent outside writes show change marks", async () => {
    const user = userEvent.setup();
    let serverContent = SOURCE;
    let serverUpdatedAt: string =
      asset.updated_at ?? "2026-01-01T00:00:00.000Z";

    (useAssetStore.getState as jest.Mock).mockReturnValue({
      get: jest.fn(async () => ({ ...asset, updated_at: serverUpdatedAt })),
      add: jest.fn()
    });
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => serverContent
    })) as unknown as typeof fetch;

    (trpcClient.textDocuments.restore.mutate as jest.Mock).mockRejectedValueOnce(
      new Error("Restore failed on server")
    );

    renderEditor();
    await screen.findByRole("heading", { name: "Launch notes" });

    // Open Snapshots Mode and trigger a snapshot restore that rejects.
    await user.click(screen.getByRole("button", { name: "Open Snapshots" }));
    const initialDraftItem = await screen.findByText("Initial draft");
    fireEvent.contextMenu(initialDraftItem);
    await user.click(await screen.findByRole("menuitem", { name: "Restore" }));
    expect(await screen.findByText("Restore snapshot")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(
      await screen.findByText("Restore failed on server")
    ).toBeInTheDocument();

    // Close the restore dialog after failure.
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByText("Restore snapshot")).toBeNull();
    });

    // A later outside write must still render DocumentChangesBar and highlight marks in the editor.
    serverContent =
      "# Launch notes updated externally\n\n- [ ] write the plan\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n";
    serverUpdatedAt = "2026-01-01T00:07:00.000Z";

    act(() => {
      handleDocumentResourceChange("asset", {
        event: "updated",
        id: "doc-1",
        updatedAt: serverUpdatedAt
      });
    });

    const liveEditor = screen.getByLabelText("notes.md");
    await waitFor(() => {
      expect(screen.getByText(/Marked changes:\s*1/i)).toBeInTheDocument();
      expect(
        within(liveEditor).getByRole("heading", {
          name: "Launch notes updated externally"
        })
      ).toBeInTheDocument();
    });
    expect(liveEditor.querySelector(".doc-change-modified")).not.toBeNull();
  });

  it("protects newer user edits on proposal accept: merges disjoint edits, confirms conflicts, and aborts on async conflict", async () => {
    const user = userEvent.setup();
    const baseDoc =
      "# Launch notes\n\nIntro section text here.\n\nDetails section text here.\n";
    let serverContent = baseDoc;
    let serverUpdatedAt: string =
      asset.updated_at ?? "2026-01-01T00:00:00.000Z";

    (useAssetStore.getState as jest.Mock).mockReturnValue({
      get: jest.fn(async () => ({ ...asset, updated_at: serverUpdatedAt })),
      add: jest.fn()
    });
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => serverContent
    })) as unknown as typeof fetch;

    renderEditor();
    await screen.findByRole("heading", { name: "Launch notes" });

    // Switch to Markdown view and edit the Intro section while proposal edits Details.
    await user.click(screen.getByRole("button", { name: "Markdown" }));
    const markdownArea = await screen.findByLabelText("markdown source");
    const userEditedDisjoint =
      "# Launch notes\n\nIntro section edited by user.\n\nDetails section text here.\n";
    fireEvent.change(markdownArea, { target: { value: userEditedDisjoint } });

    const disjointProposed =
      "# Launch notes\n\nIntro section text here.\n\nDetails section improved by assistant.\n";
    act(() => {
      useDocumentProposalStore.getState().setProposal({
        proposalId: "prop-disjoint",
        assetId: "doc-1",
        threadId: "thread-1",
        turnId: "turn-1",
        baseContent: baseDoc,
        proposedContent: disjointProposed,
        draftContent: disjointProposed,
        receivedAt: 1700000000000
      });
    });

    const acceptMergeButton = await screen.findByRole("button", {
      name: "Accept & merge"
    });
    await user.click(acceptMergeButton);

    const expectedMerged =
      "# Launch notes\n\nIntro section edited by user.\n\nDetails section improved by assistant.\n";
    await waitFor(() => {
      expect(trpcClient.assets.update.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "doc-1",
          data: expectedMerged
        })
      );
      expect(useDocumentProposalStore.getState().proposals["doc-1"]).toBeUndefined();
    });
    expect(markdownArea).toHaveValue(expectedMerged);

    // Now test an async conflict arriving during pre-turn version creation:
    // Accept must abort and warn rather than silently overwriting the newer edit.
    (trpcClient.assets.update.mutate as jest.Mock).mockClear();
    serverContent = expectedMerged;
    const conflictProposal =
      "# Launch notes\n\nIntro section rewritten by assistant.\n\nDetails section improved by assistant.\n";
    act(() => {
      useDocumentProposalStore.getState().setProposal({
        proposalId: "prop-race",
        assetId: "doc-1",
        threadId: "thread-1",
        turnId: "turn-2",
        baseContent: expectedMerged,
        proposedContent: conflictProposal,
        draftContent: conflictProposal,
        receivedAt: 1700000002000
      });
    });

    (
      trpcClient.textDocuments.createVersion.mutate as jest.Mock
    ).mockImplementationOnce(async () => {
      // Simulate an external edit landing in the same paragraph while snapshot runs.
      serverContent =
        "# Launch notes\n\nIntro section edited remotely during accept.\n\nDetails section improved by assistant.\n";
      serverUpdatedAt = "2026-01-01T00:09:00.000Z";
      act(() => {
        handleDocumentResourceChange("asset", {
          event: "updated",
          id: "doc-1",
          updatedAt: serverUpdatedAt
        });
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { version: 4 };
    });

    await user.click(await screen.findByRole("button", { name: "Accept" }));

    await waitFor(() => {
      expect(
        useNotificationStore
          .getState()
          .notifications.some(
            (n) =>
              n.type === "warning" &&
              /document changed before the proposal was applied/i.test(n.content)
          )
      ).toBe(true);
    });
    expect(trpcClient.assets.update.mutate).not.toHaveBeenCalled();
    expect(useDocumentProposalStore.getState().proposals["doc-1"]).toBeDefined();

    // Switch back to formatted view (synced with the remote conflicting edit)
    // and verify conflict confirmation dialog: Cancel keeps user edit, Overwrite applies proposal.
    await user.click(screen.getByRole("button", { name: "Formatted" }));
    expect(await screen.findByText(/1 conflicting section/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByText("Overwrite newer edits?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByText("Overwrite newer edits?")).toBeNull();
    });
    expect(trpcClient.assets.update.mutate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Accept" }));
    await user.click(
      await screen.findByRole("button", { name: "Overwrite my edits" })
    );
    await waitFor(() => {
      expect(trpcClient.assets.update.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "doc-1",
          data: conflictProposal
        })
      );
      expect(useDocumentProposalStore.getState().proposals["doc-1"]).toBeUndefined();
    });
  });

  it("queues incoming proposals while user is editing a proposal draft and wires keep/replace actions", async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByRole("heading", { name: "Launch notes" });

    act(() => {
      useDocumentProposalStore.getState().setProposal({
        proposalId: "prop-1",
        assetId: "doc-1",
        threadId: "thread-1",
        turnId: "turn-1",
        baseContent: SOURCE,
        proposedContent: "# Launch notes\n\nFirst proposal.\n",
        draftContent: "# Launch notes\n\nFirst proposal.\n",
        receivedAt: 1700000000000
      });
    });

    // Edit the draft so it differs from proposedContent.
    await user.click(
      await screen.findByRole("button", { name: "Edit proposed version" })
    );
    const editor = screen.getByLabelText("Edit proposed version");
    await user.type(editor, " Extra edit");

    // Stage a newer proposal while the draft is edited -> queued instead of replacing.
    act(() => {
      useDocumentProposalStore.getState().setProposal({
        proposalId: "prop-2",
        assetId: "doc-1",
        threadId: "thread-1",
        turnId: "turn-2",
        baseContent: SOURCE,
        proposedContent: "# Launch notes\n\nSecond proposal.\n",
        draftContent: "# Launch notes\n\nSecond proposal.\n",
        receivedAt: 1700000005000
      });
    });

    expect(
      await screen.findByText(/new proposal arrived while you have unsaved edits/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Replace with new proposal" }));
    expect(screen.getByLabelText("Edit proposed version")).toHaveValue(
      "# Launch notes\n\nSecond proposal.\n"
    );
    expect(
      screen.queryByText(/new proposal arrived while you have unsaved edits/i)
    ).toBeNull();
  });
});
