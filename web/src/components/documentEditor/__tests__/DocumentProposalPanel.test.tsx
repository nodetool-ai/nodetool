import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import type { DocumentProposal } from "../../../stores/DocumentProposalStore";
import DocumentProposalPanel, {
  computeLineDiff,
  reconcileProposalWithCurrent
} from "../DocumentProposalPanel";

const sampleProposal: DocumentProposal = {
  proposalId: "p-1",
  assetId: "doc-1",
  threadId: "t-1",
  turnId: "turn-1",
  baseContent: "# Title\n\nOld line\nKeep line",
  proposedContent: "# Title\n\nNew line\nKeep line",
  draftContent: "# Title\n\nNew line\nKeep line",
  receivedAt: 1700000000000
};

describe("computeLineDiff", () => {
  it("detects unchanged, removed, and added lines", () => {
    expect(computeLineDiff("a\nb\nc", "a\nB\nc\nd")).toEqual([
      { kind: "unchanged", text: "a" },
      { kind: "removed", text: "b" },
      { kind: "added", text: "B" },
      { kind: "unchanged", text: "c" },
      { kind: "added", text: "d" }
    ]);
  });

  it("handles empty inputs without spurious removed lines", () => {
    expect(computeLineDiff("", "hello")).toEqual([
      { kind: "added", text: "hello" }
    ]);
    expect(computeLineDiff("hello", "")).toEqual([
      { kind: "removed", text: "hello" }
    ]);
  });
});

describe("reconcileProposalWithCurrent (F1)", () => {
  const base = "# Title\n\nFirst paragraph here.\n\nSecond paragraph here.\n";

  it("returns clean when currentContent matches baseContent", () => {
    const draft = "# Title\n\nFirst paragraph here.\n\nSecond paragraph updated.\n";
    expect(reconcileProposalWithCurrent(base, base, draft)).toEqual({
      kind: "clean",
      mergedContent: draft,
      conflictCount: 0
    });
  });

  it("returns merged when user and proposal edited disjoint blocks", () => {
    const current = "# Title\n\nFirst paragraph edited by user.\n\nSecond paragraph here.\n";
    const draft = "# Title\n\nFirst paragraph here.\n\nSecond paragraph revised by agent.\n";
    const result = reconcileProposalWithCurrent(base, current, draft);
    expect(result.kind).toBe("merged");
    expect(result.conflictCount).toBe(0);
    expect(result.mergedContent).toBe(
      "# Title\n\nFirst paragraph edited by user.\n\nSecond paragraph revised by agent.\n"
    );
  });

  it("returns conflict when both sides edited the same block", () => {
    const current = "# Title\n\nFirst paragraph edited by user.\n\nSecond paragraph here.\n";
    const draft = "# Title\n\nFirst paragraph edited by agent.\n\nSecond paragraph here.\n";
    const result = reconcileProposalWithCurrent(base, current, draft);
    expect(result.kind).toBe("conflict");
    expect(result.conflictCount).toBe(1);
    expect(result.mergedContent).toBe(draft);
  });

  it("returns conflict when both sides completely rewrote the same paragraph with unrelated words", () => {
    const current = "# Title\n\nCompletely unrelated manual rewrite.\n\nSecond paragraph here.\n";
    const draft = "# Title\n\nTotally distinct assistant replacement.\n\nSecond paragraph here.\n";
    const result = reconcileProposalWithCurrent(base, current, draft);
    expect(result.kind).toBe("conflict");
    expect(result.conflictCount).toBeGreaterThanOrEqual(1);
    expect(result.mergedContent).toBe(draft);
  });
});

describe("DocumentProposalPanel (D2, R9)", () => {
  it("shows diff preview, toggles to editable mode, and calls onAccept/onReject", async () => {
    const user = userEvent.setup();
    const onDraftChange = jest.fn();
    const onAccept = jest.fn();
    const onReject = jest.fn();

    render(
      <ThemeProvider theme={mockTheme}>
        <DocumentProposalPanel
          proposal={sampleProposal}
          currentContent={sampleProposal.baseContent}
          onDraftChange={onDraftChange}
          onAccept={onAccept}
          onReject={onReject}
        />
      </ThemeProvider>
    );

    expect(screen.getByText("Old line")).toBeInTheDocument();
    expect(screen.getByText("New line")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.getByText("-1")).toBeInTheDocument();

    // Switch to edit proposed version.
    await user.click(
      screen.getByRole("button", { name: "Edit proposed version" })
    );
    const editor = screen.getByLabelText("Edit proposed version");
    expect(editor).toHaveValue(sampleProposal.draftContent);

    await user.type(editor, "!");
    expect(onDraftChange).toHaveBeenCalled();

    // Switch back to Preview diff.
    await user.click(screen.getByRole("button", { name: "Preview diff" }));
    expect(screen.getByText("Old line")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(onAccept).toHaveBeenCalledWith(sampleProposal.draftContent);

    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("merges disjoint edits cleanly via Accept & merge without overwriting user edits", async () => {
    const user = userEvent.setup();
    const onAccept = jest.fn();
    const multiBlockProposal: DocumentProposal = {
      ...sampleProposal,
      baseContent: "# Title\n\nIntro paragraph here.\n\nDetails paragraph here.\n",
      proposedContent: "# Title\n\nIntro paragraph here.\n\nDetails paragraph revised.\n",
      draftContent: "# Title\n\nIntro paragraph here.\n\nDetails paragraph revised.\n"
    };
    const userEditedCurrent =
      "# Title\n\nIntro paragraph edited by user.\n\nDetails paragraph here.\n";

    render(
      <ThemeProvider theme={mockTheme}>
        <DocumentProposalPanel
          proposal={multiBlockProposal}
          currentContent={userEditedCurrent}
          onDraftChange={jest.fn()}
          onAccept={onAccept}
          onReject={jest.fn()}
        />
      </ThemeProvider>
    );

    expect(
      screen.getByText(/document changed in other sections/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText("Intro paragraph edited by user.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Details paragraph revised.")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Accept & merge" }));
    expect(onAccept).toHaveBeenCalledWith(
      "# Title\n\nIntro paragraph edited by user.\n\nDetails paragraph revised.\n"
    );
  });

  it("warns on conflicting edits and requires confirmation dialog before overwriting", async () => {
    const user = userEvent.setup();
    const onAccept = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <DocumentProposalPanel
          proposal={sampleProposal}
          currentContent={"# Title\n\nEdited manually"}
          onDraftChange={jest.fn()}
          onAccept={onAccept}
          onReject={jest.fn()}
        />
      </ThemeProvider>
    );

    expect(
      screen.getByText(/document changed since this proposal was generated/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/1 conflicting section/i)).toBeInTheDocument();

    // Clicking Accept opens confirmation dialog and does not apply immediately.
    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(onAccept).not.toHaveBeenCalled();
    expect(screen.getByText("Overwrite newer edits?")).toBeInTheDocument();

    // Canceling closes the dialog without calling onAccept.
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByText("Overwrite newer edits?")).toBeNull();
    });
    expect(onAccept).not.toHaveBeenCalled();

    // Confirming "Overwrite my edits" calls onAccept with forceOverwrite.
    await user.click(screen.getByRole("button", { name: "Accept" }));
    await user.click(
      await screen.findByRole("button", { name: "Overwrite my edits" })
    );
    expect(onAccept).toHaveBeenCalledWith(sampleProposal.draftContent, {
      forceOverwrite: true
    });
  });

  it("shows queued proposal banner with Keep my edits and Replace with new proposal actions", async () => {
    const user = userEvent.setup();
    const onAcceptQueued = jest.fn();
    const onDismissQueued = jest.fn();
    const queued: DocumentProposal = {
      ...sampleProposal,
      proposalId: "p-2",
      proposedContent: "# Title\n\nNewer agent proposal",
      draftContent: "# Title\n\nNewer agent proposal"
    };

    render(
      <ThemeProvider theme={mockTheme}>
        <DocumentProposalPanel
          proposal={{
            ...sampleProposal,
            draftContent: "# Title\n\nUser edited draft"
          }}
          queuedProposal={queued}
          currentContent={sampleProposal.baseContent}
          onDraftChange={jest.fn()}
          onAccept={jest.fn()}
          onReject={jest.fn()}
          onAcceptQueued={onAcceptQueued}
          onDismissQueued={onDismissQueued}
        />
      </ThemeProvider>
    );

    expect(
      screen.getByText(/new proposal arrived while you have unsaved edits/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Keep my edits" }));
    expect(onDismissQueued).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole("button", { name: "Replace with new proposal" })
    );
    expect(onAcceptQueued).toHaveBeenCalledTimes(1);
  });
});
