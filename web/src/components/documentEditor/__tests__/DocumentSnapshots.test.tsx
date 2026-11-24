import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import DocumentSnapshotViewer from "../DocumentSnapshotViewer";
import DocumentSnapshotsList, {
  type SnapshotVersionSummary
} from "../DocumentSnapshotsList";

const VERSIONS: SnapshotVersionSummary[] = [
  {
    version: 1,
    name: "Initial draft",
    save_type: "manual",
    created_at: "2026-01-01T10:00:00.000Z"
  },
  {
    version: 2,
    name: null,
    save_type: "agent_turn",
    created_at: "2026-01-01T11:00:00.000Z"
  }
];

describe("DocumentSnapshotViewer (R11, R31)", () => {
  it("shows EmptyState when no snapshot is selected", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <DocumentSnapshotViewer version={null} content={null} isLoading={false} />
      </ThemeProvider>
    );
    expect(screen.getByText("No snapshot selected")).toBeInTheDocument();
  });

  it("renders formatted read-only Markdown content with paper theme and zoom", async () => {
    const { container, rerender } = render(
      <ThemeProvider theme={mockTheme}>
        <DocumentSnapshotViewer
          version={VERSIONS[0]}
          content={"# Scene One\n\nCopyable passage here."}
          isLoading={false}
          paperTheme="white"
          zoom={1.25}
        />
      </ThemeProvider>
    );

    expect(screen.getByText("Initial draft")).toBeInTheDocument();
    expect(screen.getByText("Read-only")).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Scene One" })
    ).toBeInTheDocument();
    expect(screen.getByText("Copyable passage here.")).toBeInTheDocument();

    const viewerInput = screen.getByLabelText("Snapshot preview");
    expect(viewerInput).toHaveAttribute("contenteditable", "false");
    expect(container.querySelector(".doc-paper-white")).not.toBeNull();
    expect(
      (container.querySelector(".doc-snapshot-viewer") as HTMLElement)?.style.getPropertyValue(
        "--doc-zoom"
      )
    ).toBe("1.25");

    rerender(
      <ThemeProvider theme={mockTheme}>
        <DocumentSnapshotViewer
          version={VERSIONS[1]}
          content={"## Updated heading"}
          isLoading={false}
          paperTheme="gray"
          zoom={1}
        />
      </ThemeProvider>
    );

    expect(
      await screen.findByRole("heading", { name: "Updated heading" })
    ).toBeInTheDocument();
    expect(container.querySelector(".doc-paper-gray")).not.toBeNull();
  });

  it("explains when a selected snapshot had no text and shows an error banner on load failure", () => {
    const { rerender } = render(
      <ThemeProvider theme={mockTheme}>
        <DocumentSnapshotViewer
          version={VERSIONS[0]}
          content=""
          isLoading={false}
        />
      </ThemeProvider>
    );

    expect(screen.getByText("Empty snapshot")).toBeInTheDocument();
    expect(
      screen.getByText("This snapshot had no text when it was saved.")
    ).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={mockTheme}>
        <DocumentSnapshotViewer
          version={VERSIONS[1]}
          content={null}
          isLoading={false}
          error={new Error("Version 2 not found")}
        />
      </ThemeProvider>
    );

    expect(
      screen.getByText("This snapshot could not be loaded.")
    ).toBeInTheDocument();
  });
});

describe("DocumentSnapshotsList (R11, R31)", () => {
  it("sorts snapshots newest first, selects on click, and handles Rename, Restore, and Delete via context menu", async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    const onRename = jest.fn(async () => {});
    const onRestore = jest.fn(async () => {});
    const onDelete = jest.fn(async () => {});

    render(
      <ThemeProvider theme={mockTheme}>
        <DocumentSnapshotsList
          versions={VERSIONS}
          selectedVersion={2}
          isLoading={false}
          error={null}
          onSelect={onSelect}
          onRename={onRename}
          onRestore={onRestore}
          onDelete={onDelete}
        />
      </ThemeProvider>
    );

    const rows = screen.getAllByRole("button");
    // Version 2 appears before Version 1 (newest first).
    expect(rows[0]).toHaveTextContent("Version 2");
    expect(rows[1]).toHaveTextContent("Initial draft");

    await user.click(rows[1]);
    expect(onSelect).toHaveBeenCalledWith(1);

    // Context menu -> Rename.
    fireEvent.contextMenu(rows[1]);
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    const nameInput = screen.getByLabelText("Snapshot name");
    expect(nameInput).toHaveValue("Initial draft");
    await user.clear(nameInput);
    await user.type(nameInput, "Before rewrite");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(onRename).toHaveBeenCalledWith(1, "Before rewrite");
    });

    // Context menu -> Restore (requires confirmation).
    fireEvent.contextMenu(rows[0]);
    await user.click(screen.getByRole("menuitem", { name: "Restore" }));
    expect(onRestore).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => {
      expect(onRestore).toHaveBeenCalledWith(2);
    });

    // Context menu -> Delete (requires confirmation).
    fireEvent.contextMenu(rows[1]);
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith(1);
    });
  });
});
