import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import DocumentSnapshotViewer from "../DocumentSnapshotViewer";
import DocumentOutlinePanel, {
  type DocumentOutlineSource
} from "../DocumentOutlinePanel";
import type { DocumentOutline } from "../DocumentOutlinePlugin";

const SNAPSHOT = {
  version: 3,
  name: "Before rewrite",
  save_type: "manual",
  created_at: "2026-01-01T10:00:00.000Z"
};

const CONTENT = [
  "# Act One",
  "",
  "Opening text.",
  "",
  "## Scene One",
  "",
  "### Beat A",
  "",
  "#",
  "",
  "# Act Two"
].join("\n");

const CURRENT: DocumentOutline = {
  items: [{ key: "c1", level: 2, text: "Live chapter" }],
  activeKey: "c1",
  reveal: jest.fn()
};

function Harness({
  onRevealCurrent
}: {
  onRevealCurrent: (key: string) => void;
}) {
  const [snapshot, setSnapshot] = useState<DocumentOutline | null>(null);
  const [source, setSource] = useState<DocumentOutlineSource>("current");
  return (
    <ThemeProvider theme={mockTheme}>
      <DocumentSnapshotViewer
        version={SNAPSHOT}
        content={CONTENT}
        isLoading={false}
        onOutlineChange={setSnapshot}
      />
      <DocumentOutlinePanel
        current={CURRENT}
        snapshot={snapshot}
        snapshotsOpen
        hasSnapshot
        source={source}
        onSourceChange={setSource}
        onRevealCurrent={onRevealCurrent}
      />
    </ThemeProvider>
  );
}

describe("DocumentOutlinePanel", () => {
  const scrollIntoView = jest.fn();
  beforeEach(() => {
    scrollIntoView.mockClear();
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  it("lists the live document's headings and jumps through the host", async () => {
    const onRevealCurrent = jest.fn();
    render(<Harness onRevealCurrent={onRevealCurrent} />);

    const nav = screen.getByRole("navigation", { name: "Document structure" });
    expect(nav).toHaveTextContent("Live chapter");

    await userEvent.click(screen.getByRole("button", { name: "Live chapter" }));
    expect(onRevealCurrent).toHaveBeenCalledWith("c1");
  });

  it("switches to the snapshot's own tree and jumps without animation", async () => {
    render(<Harness onRevealCurrent={jest.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Snapshot" }));
    const nav = await screen.findByRole("navigation", {
      name: "Snapshot structure"
    });
    await waitFor(() =>
      expect(nav.querySelectorAll("button")).toHaveLength(4)
    );
    // The empty "#" heading is left out.
    expect(
      Array.from(nav.querySelectorAll("button")).map((b) => b.textContent)
    ).toEqual(["Act One", "Scene One", "Beat A", "Act Two"]);

    await userEvent.click(screen.getByRole("button", { name: "Beat A" }));
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "instant"
    });
    const target = scrollIntoView.mock.contexts.at(-1) as HTMLElement;
    expect(target.tagName).toBe("H3");
    expect(target).toHaveTextContent("Beat A");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Beat A" })).toHaveAttribute(
        "aria-current",
        "location"
      )
    );
  });

  it("explains how to add headings when there are none", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <DocumentOutlinePanel
          current={{ items: [], activeKey: null, reveal: jest.fn() }}
          snapshot={null}
          snapshotsOpen={false}
          hasSnapshot={false}
          source="current"
          onSourceChange={jest.fn()}
          onRevealCurrent={jest.fn()}
        />
      </ThemeProvider>
    );
    expect(screen.getByText("No headings")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Snapshot" })
    ).not.toBeInTheDocument();
  });
});
