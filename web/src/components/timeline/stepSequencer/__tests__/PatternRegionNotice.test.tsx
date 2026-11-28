/** F43: a failed conversion shows an error banner instead of a silent rejection. */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { TimelineProvider, createTimelineInstance } from "../../../../stores/timeline/TimelineInstance";
import { PatternRegionNotice } from "../PatternRegionNotice";

jest.mock("../../../../hooks/timeline/useTimelineAgentBridge", () => ({
  createBrowserStepPatternLibrary: () => ({ list: async () => [], save: async () => ({ id: "u1" }) })
}));

it("shows the op error when Convert to MIDI Region fails (F43)", async () => {
  const user = userEvent.setup();
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider instance={createTimelineInstance()}>
        <PatternRegionNotice clipId="missing" />
      </TimelineProvider>
    </ThemeProvider>
  );
  await user.click(screen.getByRole("button", { name: /Convert to MIDI/i }));
  expect(await screen.findByTestId("pattern-region-notice-error")).toBeInTheDocument();
});
