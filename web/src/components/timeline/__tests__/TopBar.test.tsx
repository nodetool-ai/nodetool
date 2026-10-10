/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";


import { TopBar } from "../TopBar";
import { useDocumentDraftStore } from "../../../stores/DocumentDraftStore";

const renderTopBar = (props: React.ComponentProps<typeof TopBar>) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TopBar {...props} />
    </ThemeProvider>
  );

describe("TopBar project archive action", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("offers the project archive in the overflow menu", async () => {
    const onExportBundle = jest.fn();
    renderTopBar({ onExportBundle });

    await userEvent.click(
      screen.getByRole("button", { name: "More timeline actions" })
    );
    await userEvent.click(await screen.findByText("Export project (.zip)"));
    expect(onExportBundle).toHaveBeenCalledTimes(1);
  });

  it("shows the busy label while the archive is being prepared", async () => {
    renderTopBar({ onExportBundle: jest.fn(), isExportingBundle: true });
    await userEvent.click(
      screen.getByRole("button", { name: "More timeline actions" })
    );
    expect(
      await screen.findByRole("menuitem", { name: "Exporting…" })
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("opens Adapt format from the timeline actions", async () => {
    const onAdaptFormat = jest.fn();
    renderTopBar({ onAdaptFormat });

    await userEvent.click(
      screen.getByRole("button", { name: "More timeline actions" })
    );
    await userEvent.click(await screen.findByText("Adapt format"));

    expect(onAdaptFormat).toHaveBeenCalledTimes(1);
  });

  it("omits the action when no handler is given", () => {
    renderTopBar({ onSave: jest.fn() });
    expect(
      screen.queryByRole("button", { name: "More timeline actions" })
    ).not.toBeInTheDocument();
  });
});

describe("TopBar Code button", () => {
  it("omits the Code button for a timeline with no code", () => {
    renderTopBar({ onOpenCode: jest.fn(), hasCode: false });
    expect(
      screen.queryByRole("button", { name: "Open the timeline's code" })
    ).not.toBeInTheDocument();
  });

  it("opens the code panel when clicked", async () => {
    const onOpenCode = jest.fn();
    renderTopBar({ onOpenCode, hasCode: true });

    await userEvent.click(
      screen.getByRole("button", { name: "Open the timeline's code" })
    );
    expect(onOpenCode).toHaveBeenCalledTimes(1);
  });
});

describe("TopBar save state", () => {
  afterEach(() => {
    useDocumentDraftStore.getState().setDirty("timeline:seq-1", false);
    useDocumentDraftStore.getState().setSaving("timeline:seq-1", false);
  });

  it("reads Saved, Unsaved changes and Saving… from the autosave state", () => {
    renderTopBar({ onSave: jest.fn(), sequenceId: "seq-1" });
    expect(screen.getByRole("status")).toHaveTextContent("Saved");

    act(() => useDocumentDraftStore.getState().setDirty("timeline:seq-1", true));
    expect(screen.getByRole("status")).toHaveTextContent("Unsaved changes");

    act(() => useDocumentDraftStore.getState().setSaving("timeline:seq-1", true));
    expect(screen.getByRole("status")).toHaveTextContent("Saving…");
  });
});

describe("TopBar panel toggles", () => {
  it("offers no panel toggles without handlers", () => {
    renderTopBar({});
    expect(
      screen.queryByRole("button", { name: /transcript/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /side panel/ })
    ).not.toBeInTheDocument();
  });

  it("hides the transcript and the side panel", async () => {
    const onToggleTranscript = jest.fn();
    const onToggleSidePanel = jest.fn();
    renderTopBar({
      onToggleTranscript,
      transcriptVisible: true,
      onToggleSidePanel,
      sidePanelVisible: false
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Hide transcript" })
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Show side panel" })
    );
    expect(onToggleTranscript).toHaveBeenCalledTimes(1);
    expect(onToggleSidePanel).toHaveBeenCalledTimes(1);
  });
});
