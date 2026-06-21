/**
 * TracksRegion script gating — the ScriptLane and its header render only when
 * the sequence has the script feature enabled (scriptEnabled). Toggling the
 * flag off hides both without touching tracks/clips.
 */

import React from "react";
import { act, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { TracksRegion } from "../TracksRegion";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";

const renderRegion = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider>
        <TracksRegion heightPx={400} />
      </TimelineProvider>
    </ThemeProvider>
  );

describe("TracksRegion script gating", () => {
  it("hides ScriptLane and header when scriptEnabled is false", () => {
    renderRegion();
    act(() => {
      useTimelineStore.getState().setScriptEnabled(false);
    });

    expect(screen.queryByTestId("script-lane")).toBeNull();
    expect(screen.queryByLabelText("Script lane")).toBeNull();
    // The toggle offers to add the script.
    expect(screen.getByTestId("script-toggle-button")).toHaveTextContent(
      /add script/i
    );
  });

  it("shows ScriptLane and header when scriptEnabled is true", () => {
    renderRegion();
    act(() => {
      useTimelineStore.getState().setScriptEnabled(true);
    });

    expect(screen.getByTestId("script-lane")).toBeInTheDocument();
    expect(screen.getByLabelText("Script lane")).toBeInTheDocument();
    expect(screen.getByTestId("script-toggle-button")).toHaveTextContent(
      /remove script/i
    );
  });
});
