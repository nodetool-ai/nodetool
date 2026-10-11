/**
 * Monaco 0.55 focuses a `div.native-edit-context` (EditContext API) rather
 * than a textarea. Keys typed there must not reach the timeline shortcuts.
 */
import { describe, it, expect, jest } from "@jest/globals";
import { act, fireEvent, render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { TracksRegion } from "../TracksRegion";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";

jest.mock("../../../../lib/rest-fetch", () => ({
  restFetch: jest.fn()
}));

const setup = () => {
  const result = render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider>
        <TracksRegion heightPx={400} />
      </TimelineProvider>
    </ThemeProvider>
  );
  act(() => {
    useTimelineStore.getState().reset();
    useTimelineStore
      .getState()
      .addClips([
        makeClip({ trackId: "t1", name: "a", startMs: 0, durationMs: 1000 })
      ]);
    useTimelineUIStore.getState().setSelection([]);
  });
  const editor = document.createElement("div");
  editor.className = "monaco-editor";
  const editContext = document.createElement("div");
  editContext.className = "native-edit-context";
  editContext.tabIndex = 0;
  editor.appendChild(editContext);
  document.body.appendChild(editor);
  return { ...result, editContext, cleanup: () => editor.remove() };
};

describe("TracksRegion shortcuts while typing in Monaco", () => {
  it("ignores M typed into a Monaco edit context", () => {
    const { editContext, cleanup } = setup();
    act(() => {
      fireEvent.keyDown(editContext, { key: "m" });
    });
    expect(useTimelineStore.getState().markers).toHaveLength(0);
    cleanup();
  });

  it("still handles M outside the editor", () => {
    const { cleanup } = setup();
    act(() => {
      fireEvent.keyDown(window, { key: "m" });
    });
    expect(useTimelineStore.getState().markers).toHaveLength(1);
    cleanup();
  });
});
