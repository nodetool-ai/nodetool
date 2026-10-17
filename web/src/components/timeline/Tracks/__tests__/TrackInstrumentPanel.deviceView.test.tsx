/**
 * The inspector's instrument tab shows the device view registered for the
 * track's instrument, in place of the built-in editor.
 */
import React from "react";
import { act, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { findInstrumentPreset } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { TrackInstrumentPanel } from "../TrackInstrumentPanel";

jest.mock("../../preview/audition", () => ({
  playAuditionNote: jest.fn(async () => undefined),
  AUDITION_NOTE_MS: 600,
  AUDITION_DEFAULT_PITCH: 60
}));
jest.mock("../../daw/devices/registerDeviceViews", () => ({}));
jest.mock("../../daw/devices/deviceViews", () => {
  const { lazy } = jest.requireActual<typeof import("react")>("react");
  const { createElement } = jest.requireActual<typeof import("react")>("react");
  const WavetableView = lazy(async () => ({
    default: ({ trackId }: { trackId: string }) =>
      createElement("div", { "data-testid": "wt1-device-view" }, trackId)
  }));
  return {
    instrumentView: (type: string | undefined) => (type === "wavetable" ? WavetableView : null),
    fxView: () => null
  };
});

it("renders the registered device view for the track's instrument", async () => {
  const preset = findInstrumentPreset("wt1-bloom-pad");
  if (preset?.instrument.type !== "wavetable") throw new Error("WT-1 preset missing");
  act(() => {
    useTimelineStore.getState().addTrack("midi", "Keys");
  });
  const track = useTimelineStore.getState().tracks.find((t) => t.type === "midi")!;
  act(() => useTimelineStore.getState().setTrackInstrument(track.id, preset.instrument));

  render(
    <ThemeProvider theme={mockTheme}>
      <TrackInstrumentPanel trackId={track.id} />
    </ThemeProvider>
  );
  expect(await screen.findByTestId("wt1-device-view")).toHaveTextContent(track.id);
  // The preset picker stays above the device.
  expect(screen.getByLabelText("Instrument preset")).toBeInTheDocument();
});
