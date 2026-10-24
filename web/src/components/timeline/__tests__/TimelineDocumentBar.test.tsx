/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";


import { TimelineDocumentBar } from "../TimelineDocumentBar";
import { useDocumentDraftStore } from "../../../stores/DocumentDraftStore";
import { TimelineProvider } from "../../../stores/timeline/TimelineInstance";

type BarProps = Partial<React.ComponentProps<typeof TimelineDocumentBar>>;

const renderTopBar = (props: BarProps) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider>
        <TimelineDocumentBar title="Cut" {...props} />
      </TimelineProvider>
    </ThemeProvider>
  );

describe("TimelineDocumentBar overflow menu", () => {
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

  it("offers the Premiere Pro export in the overflow menu", async () => {
    const onExportPremiere = jest.fn();
    renderTopBar({ onExportPremiere });

    await userEvent.click(
      screen.getByRole("button", { name: "More timeline actions" })
    );
    await userEvent.click(await screen.findByText("Export for Premiere Pro"));
    expect(onExportPremiere).toHaveBeenCalledTimes(1);
  });

  it("offers the media export in the overflow menu", async () => {
    const onExportMedia = jest.fn();
    renderTopBar({ onExportMedia });

    await userEvent.click(
      screen.getByRole("button", { name: "More timeline actions" })
    );
    await userEvent.click(await screen.findByText("Export media (.zip)"));
    expect(onExportMedia).toHaveBeenCalledTimes(1);
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

  it("omits the menu when no handler is given", () => {
    renderTopBar({});
    expect(
      screen.queryByRole("button", { name: "More timeline actions" })
    ).not.toBeInTheDocument();
  });

  it("offers the Code panel in the menu only when the timeline has code", async () => {
    const onOpenCode = jest.fn();
    const { unmount } = renderTopBar({ onOpenCode, hasCode: false });
    expect(
      screen.queryByRole("button", { name: "More timeline actions" })
    ).not.toBeInTheDocument();
    unmount();

    renderTopBar({ onOpenCode, hasCode: true });
    await userEvent.click(
      screen.getByRole("button", { name: "More timeline actions" })
    );
    await userEvent.click(await screen.findByText("Code"));
    expect(onOpenCode).toHaveBeenCalledTimes(1);
  });

  it("offers video or DAW in the menu when there is no Workspace menu", async () => {
    const onSetDawMode = jest.fn();
    renderTopBar({ onSetDawMode, dawMode: false });

    await userEvent.click(
      screen.getByRole("button", { name: "More timeline actions" })
    );
    expect(
      screen.getByRole("menuitemradio", { name: "Video editing" })
    ).toHaveAttribute("aria-checked", "true");
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: "Audio (DAW)" })
    );
    expect(onSetDawMode).toHaveBeenCalledWith(true);
  });
});

describe("TimelineDocumentBar actions", () => {
  it("makes Export the one primary button and has no Save button", async () => {
    const onExportVideo = jest.fn();
    renderTopBar({ onExportVideo, sequenceId: "seq-1" });

    await userEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(onExportVideo).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("puts Undo and Redo in the bar", () => {
    renderTopBar({});
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  });
});

describe("TimelineDocumentBar save status", () => {
  afterEach(() => {
    useDocumentDraftStore.getState().setDirty("timeline:seq-1", false);
    useDocumentDraftStore.getState().setSaving("timeline:seq-1", false);
  });

  it("reads Saved, Unsaved changes and Saving… from the autosave state", () => {
    renderTopBar({ sequenceId: "seq-1" });
    expect(screen.getByRole("status")).toHaveTextContent("Saved");

    act(() => useDocumentDraftStore.getState().setDirty("timeline:seq-1", true));
    expect(screen.getByRole("status")).toHaveTextContent("Unsaved changes");

    act(() => useDocumentDraftStore.getState().setSaving("timeline:seq-1", true));
    expect(screen.getByRole("status")).toHaveTextContent("Saving…");
  });
});

describe("TimelineDocumentBar panel toggles", () => {
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
