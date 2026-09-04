import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { GestureReadout, readoutText } from "../GestureReadout";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";

const renderReadout = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <GestureReadout />
    </ThemeProvider>
  );

beforeEach(() => {
  useTimelineStore.setState({ fps: 30 });
  useTimelineUIStore.setState({ gestureReadout: null });
});

describe("readoutText", () => {
  const base = { clipId: "c", startMs: 2000, durationMs: 1500, inPointMs: 500 };

  it("shows start · duration for a move", () => {
    expect(readoutText({ ...base, kind: "move" }, 30)).toBe(
      "00:00:02:00 · 00:00:01:15"
    );
  });

  it("shows in · duration for trim-start", () => {
    expect(readoutText({ ...base, kind: "trim-start" }, 30)).toBe(
      "00:00:00:15 · 00:00:01:15"
    );
  });

  it("shows duration · end for trim-end", () => {
    expect(readoutText({ ...base, kind: "trim-end" }, 30)).toBe(
      "00:00:01:15 · 00:00:03:15"
    );
  });
});

describe("GestureReadout", () => {
  it("renders nothing without an active gesture", () => {
    renderReadout();
    expect(screen.queryByTestId("timeline-gesture-readout")).toBeNull();
  });

  it("renders the pill text for the published gesture", () => {
    useTimelineUIStore.setState({
      gestureReadout: {
        clipId: "c",
        kind: "move",
        startMs: 2000,
        durationMs: 1000,
        inPointMs: 0
      }
    });
    renderReadout();
    expect(screen.getByTestId("timeline-gesture-readout")).toHaveTextContent(
      "00:00:02:00 · 00:00:01:00"
    );
  });
});
