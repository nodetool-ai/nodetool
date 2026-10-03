/** Keyframe controls stay inert while the playhead is off the clip (F66). */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import {
  TimelineProvider,
  createTimelineInstance
} from "../../../../stores/timeline/TimelineInstance";
import { ClipKeyframes } from "../ClipKeyframes";

it("disables the keyframe controls when the playhead is outside the clip", () => {
  const instance = createTimelineInstance();
  const clip = makeClip({
    name: "c",
    sourceType: "imported",
    mediaType: "video",
    startMs: 1000,
    durationMs: 1000
  });
  act(() => {
    instance.doc.setState({ clips: [clip] });
    instance.playback.getState().seek(5000);
  });
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider instance={instance}>
        <ClipKeyframes clip={clip} />
      </TimelineProvider>
    </ThemeProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: /keyframes/i }));
  expect(screen.getByRole("button", { name: /add opacity keyframe/i, hidden: true })).toBeDisabled();
  expect(screen.getByRole("textbox", { name: /opacity at playhead/i, hidden: true })).toBeDisabled();
});
