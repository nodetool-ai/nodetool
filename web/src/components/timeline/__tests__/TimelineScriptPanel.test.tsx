/**
 * TimelineScriptPanel — the linked script as a compact line list.
 *
 * Covers what the panel adds on top of the script store: the transcript
 * editor when no script is linked, editable line text, the voice action only
 * on a line whose audio is missing or out of date, and focus in a line
 * selecting its clip.
 */

import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../__mocks__/themeMock";
import { TimelineScriptPanel } from "../TimelineScriptPanel";
import {
  createTimelineInstance,
  TimelineProvider
} from "../../../stores/timeline/TimelineInstance";
import { useScriptStore, type ScriptTake } from "../../../stores/script/ScriptStore";
import { useNotificationStore } from "../../../stores/NotificationStore";

const mockUpdate = jest.fn();
jest.mock("../../../trpc/client", () => ({
  trpc: {
    useUtils: () => ({ scripts: { list: { invalidate: jest.fn() } } }),
    scripts: {
      list: {
        // The link menu lists the project's scripts. The timeline's own link
        // query finds nothing, so links come from the store.
        useQuery: (input: { projectId?: string }) => ({
          data: "projectId" in input ? [{ id: "script-1", name: "Promo" }] : undefined
        })
      }
    }
  },
  trpcClient: {
    scripts: { update: { mutate: (...args: unknown[]) => mockUpdate(...args) } }
  }
}));
jest.mock("../../../hooks/useTimelineSequence", () => ({
  useTimeline: () => ({ data: { id: "seq-1", name: "Cut", projectId: "p1" } })
}));
jest.mock("../TranscriptPanel", () => ({
  TranscriptPanel: ({ headerAction }: { headerAction?: React.ReactNode }) => (
    <div data-testid="transcript-panel">{headerAction}</div>
  )
}));

const take = (text: string): ScriptTake => ({
  id: "t1",
  assetId: "asset-1",
  durationMs: 1000,
  words: [],
  textSnapshot: text,
  voiceSnapshot: null,
  createdAt: "2026-01-01T00:00:00.000Z"
});

const seedScript = (timelineId: string | null) =>
  act(() => {
    useScriptStore.getState().loadScript("script-1", {
      title: "Promo",
      cast: [{ id: "sp", name: "Narrator" }],
      timelineId,
      storyboardId: null,
      sections: [
        {
          id: "sec",
          lines: [
            { id: "a", speakerId: "sp", text: "One.", takes: [take("One.")], currentTakeId: "t1" },
            { id: "b", speakerId: "sp", text: "Two.", takes: [], currentTakeId: null }
          ]
        }
      ]
    });
  });

const renderPanel = () => {
  const instance = createTimelineInstance();
  const clip = makeClip({
    id: "clip-a",
    trackId: "vo",
    mediaType: "audio",
    startMs: 2000,
    durationMs: 1000,
    scriptId: "script-1",
    scriptLineId: "a"
  });
  act(() => {
    instance.doc.setState({ sequenceId: "seq-1", clips: [clip] });
  });
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider instance={instance}>
        <TimelineScriptPanel />
      </TimelineProvider>
    </ThemeProvider>
  );
  return instance;
};

beforeEach(() => {
  mockUpdate.mockReset();
  useNotificationStore.setState({ notifications: [] });
  useScriptStore.setState({
    scripts: {},
    serverRevisions: {},
    saveStatus: {},
    voicingLineIds: {}
  });
});

describe("TimelineScriptPanel", () => {
  it("shows the transcript and a link action when no script is linked", () => {
    renderPanel();
    expect(screen.getByTestId("transcript-panel")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Link a script" })).toBeInTheDocument();
  });

  it("deletes an empty line on Backspace", () => {
    seedScript("seq-1");
    renderPanel();
    const field = screen.getAllByRole("textbox", { name: "Line text" })[1];
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.keyDown(field, { key: "Backspace" });
    expect(
      useScriptStore.getState().scripts["script-1"].sections[0].lines.map((l) => l.id)
    ).toEqual(["a"]);
  });

  it("keeps a line with text on Backspace", () => {
    seedScript("seq-1");
    renderPanel();
    fireEvent.keyDown(screen.getAllByRole("textbox", { name: "Line text" })[1], {
      key: "Backspace"
    });
    expect(
      useScriptStore.getState().scripts["script-1"].sections[0].lines
    ).toHaveLength(2);
  });

  it("lists the linked script's lines and edits their text", () => {
    seedScript("seq-1");
    renderPanel();

    const rows = screen.getAllByTestId("timeline-script-line");
    expect(rows.map((row) => row.getAttribute("data-status"))).toEqual([
      "voiced",
      "draft"
    ]);
    // One speaker name heads the run of lines.
    expect(screen.getAllByText("Narrator")).toHaveLength(1);

    const fields = screen.getAllByRole("textbox", { name: "Line text" });
    fireEvent.change(fields[0], { target: { value: "One, again." } });
    const line = useScriptStore.getState().scripts["script-1"].sections[0].lines[0];
    expect(line.text).toBe("One, again.");
    expect(
      screen.getAllByTestId("timeline-script-line")[0].getAttribute("data-status")
    ).toBe("stale");
  });

  it("offers the voice action only on lines without current audio", () => {
    seedScript("seq-1");
    renderPanel();
    expect(screen.getAllByRole("button", { name: "Voice line" })).toHaveLength(1);
  });

  it("selects the line's clip and seeks to it when the line takes focus", () => {
    seedScript("seq-1");
    const instance = renderPanel();
    fireEvent.focus(screen.getAllByRole("textbox", { name: "Line text" })[0]);
    expect([...instance.ui.getState().selectedClipIds]).toEqual(["clip-a"]);
    expect(instance.playback.getState().currentTimeMs).toBe(2000);
  });

  // A script left in the store after its tab closed has no sync to save a
  // local-only link, so the link must reach the server at once.
  it("links a script already in the store on the server and locally", async () => {
    seedScript(null);
    act(() => useScriptStore.getState().setServerRevision("script-1", "r1"));
    mockUpdate.mockResolvedValue({ updatedAt: "r2" });
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Link a script" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Promo" }));
    });

    expect(mockUpdate).toHaveBeenCalledWith({ id: "script-1", timelineId: "seq-1" });
    const state = useScriptStore.getState();
    expect(state.scripts["script-1"].timelineId).toBe("seq-1");
    expect(state.serverRevisions["script-1"]).toBe("r2");
    expect(screen.getByTestId("timeline-script-panel")).toBeInTheDocument();
  });

  it("keeps the local copy unlinked and reports an error when the link fails", async () => {
    seedScript(null);
    mockUpdate.mockRejectedValue(new Error("offline"));
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Link a script" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Promo" }));
    });

    expect(useScriptStore.getState().scripts["script-1"].timelineId).toBeNull();
    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("error");
    expect(notifications[0].content).toContain("offline");
  });

  it("keeps the link and reports an error when the unlink fails", async () => {
    seedScript("seq-1");
    mockUpdate.mockRejectedValue(new Error("offline"));
    renderPanel();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Unlink script" }));
    });

    expect(mockUpdate).toHaveBeenCalledWith({ id: "script-1", timelineId: null });
    expect(useScriptStore.getState().scripts["script-1"].timelineId).toBe("seq-1");
    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("error");
  });
});
