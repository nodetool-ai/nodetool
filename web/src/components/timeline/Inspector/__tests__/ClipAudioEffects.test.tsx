/**
 * ClipAudioEffects: adding, toggling, reordering and removing a clip's
 * real-time audio effects writes `audioEffects` through `patchClip`, and an
 * audio clip with an asset opens the audio editor on its source window.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import type { ClipAudioEffect, TimelineClip } from "@nodetool-ai/timeline";
import { makeClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { ClipAudioEffects } from "../ClipAudioEffects";
import { openPersistedFold } from "../usePersistedFold";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";

jest.mock("../ClipAudioEditorDialog", () => ({
  __esModule: true,
  default: (props: { assetId: string; sourceWindow: { start: number; end: number } }) => (
    <div data-testid="audio-editor">
      {props.assetId} {props.sourceWindow.start}-{props.sourceWindow.end}
    </div>
  )
}));

const echo: ClipAudioEffect = {
  id: "fx_echo",
  type: "echo",
  enabled: true,
  delayMs: 350,
  feedback: 0.4,
  mix: 0.35
};
const reverb: ClipAudioEffect = {
  id: "fx_reverb",
  type: "reverb",
  enabled: true,
  decaySec: 2,
  mix: 0.3
};

const patchClip = jest.fn();

beforeEach(() => {
  localStorage.clear();
  openPersistedFold("audioEffects");
  patchClip.mockReset();
  useTimelineStore.setState({ patchClip });
});

function renderSection(overrides: Partial<TimelineClip> = {}): void {
  const clip = makeClip({
    id: "clip_a",
    trackId: "t1",
    name: "Voice",
    mediaType: "audio",
    durationMs: 2000,
    ...overrides
  });
  render(
    <ThemeProvider theme={mockTheme}>
      <ClipAudioEffects clip={clip} />
    </ThemeProvider>
  );
}

const lastEffects = (): ClipAudioEffect[] =>
  patchClip.mock.calls[patchClip.mock.calls.length - 1][1].audioEffects;

describe("ClipAudioEffects", () => {
  it("adds an effect with its defaults", () => {
    renderSection({ audioEffects: [echo] });
    fireEvent.click(screen.getByRole("button", { name: "Add effect" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Reverb" }));
    expect(patchClip).toHaveBeenCalledWith("clip_a", {
      audioEffects: [echo, expect.objectContaining({ type: "reverb", enabled: true, decaySec: 2 })]
    });
  });

  it("toggles, reorders and removes effects", () => {
    renderSection({ audioEffects: [echo, reverb] });

    fireEvent.click(screen.getByRole("checkbox", { name: "Echo enabled" }));
    expect(lastEffects()).toEqual([{ ...echo, enabled: false }, reverb]);

    fireEvent.click(screen.getByRole("button", { name: "Move Reverb up" }));
    expect(lastEffects()).toEqual([reverb, echo]);

    fireEvent.click(screen.getByRole("button", { name: "Remove Echo" }));
    expect(lastEffects()).toEqual([reverb]);
  });

  it("opens the audio editor on the clip's source window", async () => {
    renderSection({ currentAssetId: "asset_1", inPointMs: 500 });
    fireEvent.click(screen.getByRole("button", { name: "Edit audio…" }));
    expect(await screen.findByTestId("audio-editor")).toHaveTextContent(
      "asset_1 0.5-2.5"
    );
  });

  it("offers no audio editor for a midi clip", () => {
    renderSection({ mediaType: "midi" });
    expect(screen.queryByRole("button", { name: "Edit audio…" })).toBeNull();
  });
});
