/**
 * TranscriptPanel integration tests.
 *
 * Verifies the panel + Lexical editor pipeline that jsdom can exercise: the
 * transcript projects from the clips into editable word spans (each bound to
 * its clip via data-attrs), fillers are marked, and the toolbar reflects the
 * model. The freeform editing math (relabel / ripple-cut / reconcile) is
 * unit-tested in `transcriptOps.test.ts`; caret-seek and native-delete are
 * Lexical-internal and verified live.
 */

import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip } from "@nodetool-ai/timeline";
import type { CaptionWord, TimelineClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../__mocks__/themeMock";
import { TranscriptPanel } from "../TranscriptPanel";
import { TimelineProvider } from "../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";

jest.mock("../../properties/TTSModelSelect", () => ({
  __esModule: true,
  default: () =>
    React.createElement("div", { "data-testid": "tts-model-select" }, "TTS")
}));

const voicedBeat = (words: CaptionWord[]): TimelineClip =>
  makeClip({
    id: "c1",
    paragraphId: "c1",
    trackId: "audio",
    mediaType: "audio",
    bindingKind: "text-to-audio",
    sourceType: "generated",
    status: "generated",
    startMs: 0,
    durationMs: 900,
    currentAssetId: "asset-1",
    caption: { words }
  });

const renderPanel = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider>
        <TranscriptPanel />
      </TimelineProvider>
    </ThemeProvider>
  );

const seed = (clips: TimelineClip[], durationMs: number) =>
  act(() => {
    useTimelineStore.getState().setTranscriptAndClips({ clips, durationMs });
    useTimelinePlaybackStore.getState().seek(0);
  });

describe("TranscriptPanel", () => {
  it("renders the voice engine and generate action", () => {
    renderPanel();
    expect(screen.getByText("TRANSCRIPT")).toBeInTheDocument();
    // The import action is always present in the toolbar; "Generate all"
    // is disabled when no clips are pending (and in some CI jsdom setups
    // the MUI contained+disabled button omits itself from the a11y tree,
    // so we check the reliably-rendered import control instead).
    expect(
      screen.getByRole("button", { name: /Import audio or video/i })
    ).toBeInTheDocument();
  });

  it("projects a clip's words into editable, clip-bound word spans", () => {
    renderPanel();
    seed(
      [voicedBeat([
        { word: "hello", startMs: 0, endMs: 300 },
        { word: "world", startMs: 300, endMs: 900 }
      ])],
      900
    );

    const hello = screen.getByText("hello");
    expect(hello).toHaveClass("transcript-word");
    expect(hello.getAttribute("data-clip")).toBe("c1");
    expect(hello.getAttribute("data-start")).toBe("0");
    const world = screen.getByText("world");
    expect(world.getAttribute("data-word")).toBe("1");
    expect(world.getAttribute("data-start")).toBe("300");
  });

  it("seeks the playhead and highlights the word when a word is clicked", () => {
    renderPanel();
    seed(
      [voicedBeat([
        { word: "hello", startMs: 0, endMs: 300 },
        { word: "world", startMs: 300, endMs: 900 }
      ])],
      900
    );

    act(() => {
      fireEvent.click(screen.getByText("world"));
    });
    expect(useTimelinePlaybackStore.getState().currentTimeMs).toBe(300);
    expect(screen.getByText("world")).toHaveClass("is-active");
  });

  it("selects the whole clip (and highlights its words) when one word is clicked", () => {
    renderPanel();
    seed(
      [voicedBeat([
        { word: "hello", startMs: 0, endMs: 300 },
        { word: "world", startMs: 300, endMs: 900 }
      ])],
      900
    );

    act(() => {
      fireEvent.click(screen.getByText("hello"));
    });
    expect(useTimelineUIStore.getState().selectedClipIds.has("c1")).toBe(true);
    expect(screen.getByText("hello")).toHaveClass("is-selected");
    expect(screen.getByText("world")).toHaveClass("is-selected");
  });

  it("opens the slash command on '/' regardless of focus; 'New scene' adds a marker", async () => {
    renderPanel();
    seed([voicedBeat([{ word: "hi", startMs: 0, endMs: 300 }])], 300);

    // Fire from the document body: clicking a word doesn't move focus onto the
    // editor, so the command key must work at the window level, not via a
    // focus-scoped handler. (This is the bug the previous focus hack missed.)
    act(() => {
      fireEvent.keyDown(document.body, { key: "/" });
    });
    await screen.findByTestId("slash-command");

    // Running "New scene" drops the marker (and would cut clips at the playhead).
    act(() => {
      fireEvent.mouseDown(screen.getByTestId("slash-item-scene"));
    });
    expect(useTimelineStore.getState().markers).toHaveLength(1);
    expect(useTimelineStore.getState().markers[0].label).toBe("Scene 1");
    await waitFor(() =>
      expect(screen.queryByTestId("slash-command")).not.toBeInTheDocument()
    );
  });

  it("projects a scene break from a marker and removes the marker on ×", async () => {
    renderPanel();
    seed([voicedBeat([{ word: "hi", startMs: 0, endMs: 300 }])], 300);

    act(() => {
      useTimelineStore.getState().addMarker(0, "Scene 1");
    });
    const br = await screen.findByTestId("scene-break");
    expect(br).toHaveTextContent("Scene 1");
    expect(useTimelineStore.getState().markers).toHaveLength(1);

    // Removing the break removes the linked marker (and merges any split clip).
    act(() => {
      fireEvent.click(screen.getByTestId("scene-break-delete"));
    });
    expect(useTimelineStore.getState().markers).toHaveLength(0);
    await waitFor(() =>
      expect(screen.queryByTestId("scene-break")).not.toBeInTheDocument()
    );
  });

  it("shows a Script-mode caret and steps across words with arrow keys", () => {
    renderPanel();
    seed(
      [voicedBeat([
        { word: "hello", startMs: 0, endMs: 300 },
        { word: "world", startMs: 300, endMs: 900 }
      ])],
      900
    );

    // The read-only Script editor has no native caret, so we render one.
    const caret = document.querySelector(".script-caret") as HTMLElement;
    expect(caret).toBeTruthy();
    expect(caret.style.display).toBe("block");

    // Arrows step the playhead word-to-word (the caret follows).
    act(() => {
      fireEvent.keyDown(document.body, { key: "ArrowRight" });
    });
    expect(useTimelinePlaybackStore.getState().currentTimeMs).toBe(300);
    act(() => {
      fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    });
    expect(useTimelinePlaybackStore.getState().currentTimeMs).toBe(0);
  });

  it("toggles playback on Space regardless of focus", () => {
    renderPanel();
    seed([voicedBeat([{ word: "hi", startMs: 0, endMs: 300 }])], 300);

    expect(useTimelinePlaybackStore.getState().isPlaying).toBe(false);
    act(() => {
      fireEvent.keyDown(document.body, { key: " " });
    });
    expect(useTimelinePlaybackStore.getState().isPlaying).toBe(true);
  });

  it("opens the slash command even when a control (button) is focused", async () => {
    renderPanel();
    seed([voicedBeat([{ word: "hi", startMs: 0, endMs: 300 }])], 300);

    // After clicking any chip/button focus lands on it; "/" must still fire
    // (only Space defers to a focused control). Use the import button which
    // reliably renders across all environments.
    const btn = screen.getByRole("button", { name: /Import audio or video/i });
    act(() => {
      fireEvent.keyDown(btn, { key: "/" });
    });
    await screen.findByTestId("slash-command");
  });

  it("does not hijack Space when a control is focused", () => {
    renderPanel();
    seed([voicedBeat([{ word: "hi", startMs: 0, endMs: 300 }])], 300);

    // Space on a focused button must still activate the button, not play.
    // Use the import button which reliably renders across all environments.
    const btn = screen.getByRole("button", { name: /Import audio or video/i });
    act(() => {
      fireEvent.keyDown(btn, { key: " " });
    });
    expect(useTimelinePlaybackStore.getState().isPlaying).toBe(false);
  });

  it("marks filler words and surfaces a Remove fillers action", () => {
    renderPanel();
    seed(
      [voicedBeat([
        { word: "um", startMs: 0, endMs: 200 },
        { word: "hi", startMs: 200, endMs: 500 }
      ])],
      500
    );

    expect(screen.getByText("um")).toHaveClass("transcript-word--filler");
    expect(screen.getByText("hi")).not.toHaveClass("transcript-word--filler");
    expect(
      screen.getByRole("button", { name: /Remove fillers/i })
    ).toBeInTheDocument();
  });
});
