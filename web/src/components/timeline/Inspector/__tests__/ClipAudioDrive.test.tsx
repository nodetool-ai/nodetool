/**
 * ClipAudioDrive — the "Animate from audio" inspector panel.
 *
 * The panel's whole job is turning a form into one request, so that is what is
 * driven here: the controls exist, the button posts the settings snake_cased
 * the way the route takes them, it locks while the bake runs, and a clip that
 * already carries an audio bake pre-fills from it and offers a re-bake.
 */

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type {
  ClipAnimation,
  TimelineClip,
  TimelineTrack
} from "@nodetool-ai/timeline";

jest.mock("../../../../utils/timelineAudioBake", () => ({
  ...jest.requireActual("../../../../utils/timelineAudioBake"),
  bakeAudioAnimation: jest.fn()
}));

import mockTheme from "../../../../__mocks__/themeMock";
import { ClipAudioDrive } from "../ClipAudioDrive";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { mockTimelineGet } from "../../../../__mocks__/trpcClientMock";
import { bakeAudioAnimation } from "../../../../utils/timelineAudioBake";

const postBake = bakeAudioAnimation as jest.MockedFunction<
  typeof bakeAudioAnimation
>;

const SEQUENCE_ID = "tl-1";

const BAKE_RESULT = {
  timeline_id: SEQUENCE_ID,
  updated_at: "2026-01-01T00:05:00.000Z",
  clip_id: "target-1",
  property: "scale",
  mode: "envelope",
  animationId: "anim-1",
  keyframeCount: 128,
  analyzed: { fromMs: 0, toMs: 4000 },
  truncated: false,
  replaced: false
};

/** A curve this panel would have produced: source-anchored, stamped `audio`. */
const EXISTING_BAKE: ClipAnimation = {
  id: "anim-1",
  role: "emphasis",
  preset: "custom",
  durationMs: 2000,
  custom: {
    timeBase: "source",
    curves: [
      {
        property: "opacity",
        keyframes: [
          { t: 0, sourceMs: 0, value: 0.4 },
          { t: 0.5, sourceMs: 1000, value: 0.9 },
          { t: 1, sourceMs: 2000, value: 0.4 }
        ]
      }
    ],
    bakedFrom: {
      kind: "audio",
      clipId: "audio-1",
      settings: {
        mode: "beats",
        attackMs: 5,
        releaseMs: 90,
        offsetMs: -30,
        sensitivity: 2,
        outputLow: 0.4,
        outputHigh: 0.9
      }
    }
  }
};

/**
 * Render the panel, then fill the surrounding instance's store. The provider
 * creates the store on mount, so seeding before the render would write into a
 * different instance than the one the panel reads.
 */
function renderPanel(fixture: Fixture) {
  const utils = render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ThemeProvider theme={mockTheme}>
        <MemoryRouter>
          <TimelineProvider>
            <ClipAudioDrive clip={fixture.target} />
          </TimelineProvider>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
  act(() => {
    useTimelineStore.setState({
      sequenceId: SEQUENCE_ID,
      baseUpdatedAt: "2026-01-01T00:00:00.000Z",
      tracks: fixture.tracks,
      clips: fixture.clips
    });
  });
  // The store action reloads the document the server wrote after a bake; hand
  // back this fixture so the panel still has its audio clips afterwards.
  mockTimelineGet.mockResolvedValue({
    id: SEQUENCE_ID,
    updatedAt: "2026-01-01T00:05:00.000Z",
    tracks: fixture.tracks,
    clips: fixture.clips,
    markers: []
  });
  return utils;
}

interface Fixture {
  target: TimelineClip;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
}

/** A video target with a music bed under it, plus a non-overlapping voiceover. */
function seed(targetOverrides: Partial<TimelineClip> = {}): Fixture {
  const videoTrack = makeTrack({ type: "video", name: "V1" });
  const audioTrack = makeTrack({ type: "audio", name: "A1" });
  const target = makeClip({
    id: "target-1",
    trackId: videoTrack.id,
    name: "Shot 1",
    startMs: 0,
    durationMs: 2000,
    mediaType: "video",
    ...targetOverrides
  });
  const music = makeClip({
    id: "audio-1",
    trackId: audioTrack.id,
    name: "Music bed",
    startMs: 0,
    durationMs: 4000,
    mediaType: "audio"
  });
  const voiceover = makeClip({
    id: "audio-2",
    trackId: audioTrack.id,
    name: "Voiceover",
    startMs: 6000,
    durationMs: 2000,
    mediaType: "audio"
  });
  return {
    target,
    tracks: [videoTrack, audioTrack],
    clips: [target, music, voiceover]
  };
}

/** Open the panel's fold — every section in the inspector starts closed. */
async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /audio drive/i }));
}

beforeEach(() => {
  localStorage.clear();
  postBake.mockReset();
  postBake.mockResolvedValue(BAKE_RESULT);
  mockTimelineGet.mockReset();
});

describe("<ClipAudioDrive />", () => {
  it("shows every control the bake takes", async () => {
    const user = userEvent.setup();
    renderPanel(seed());
    await openPanel(user);

    expect(
      screen.getByRole("combobox", { name: /audio clip to measure/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /property to drive/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /curve shape/i })).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: /range quiet value/i })
    ).toHaveValue("1");
    expect(
      screen.getByRole("textbox", { name: /range loud value/i })
    ).toHaveValue("1.15");
    expect(screen.getByRole("slider", { name: /sensitivity/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /^attack$/i })).toHaveValue("20");
    expect(screen.getByRole("textbox", { name: /^release$/i })).toHaveValue("150");
    expect(screen.getByRole("textbox", { name: /^offset$/i })).toHaveValue("0");
    expect(
      screen.getByRole("button", { name: /animate from audio/i })
    ).toBeEnabled();
  });

  it("posts the settings snake_cased, defaulting to the audio under the clip", async () => {
    const user = userEvent.setup();
    renderPanel(seed());
    await openPanel(user);

    await user.click(screen.getByRole("button", { name: /animate from audio/i }));

    await waitFor(() => expect(postBake).toHaveBeenCalledTimes(1));
    expect(postBake).toHaveBeenCalledWith(SEQUENCE_ID, {
      audio_clip_id: "audio-1",
      target_clip_id: "target-1",
      property: "scale",
      output_range: [1, 1.15],
      mode: "envelope",
      sensitivity: 1,
      attack_ms: 20,
      release_ms: 150,
      offset_ms: 0
    });
    expect(await screen.findByText(/128 keyframes/i)).toBeInTheDocument();
  });

  it("carries an edited range and the beats mode into the request", async () => {
    const user = userEvent.setup();
    renderPanel(seed());
    await openPanel(user);

    await user.click(screen.getByRole("button", { name: /beats/i }));
    const high = screen.getByRole("textbox", { name: /range loud value/i });
    await user.clear(high);
    await user.type(high, "1.4");
    await user.tab();

    await user.click(screen.getByRole("button", { name: /animate from audio/i }));

    await waitFor(() => expect(postBake).toHaveBeenCalledTimes(1));
    expect(postBake.mock.calls[0][1]).toMatchObject({
      mode: "beats",
      output_range: [1, 1.4]
    });
  });

  it("locks the button while the bake runs", async () => {
    const user = userEvent.setup();
    let settle: (result: typeof BAKE_RESULT) => void = () => {};
    postBake.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      })
    );
    renderPanel(seed());
    await openPanel(user);

    const button = screen.getByRole("button", { name: /animate from audio/i });
    await user.click(button);

    await waitFor(() => expect(button).toBeDisabled());

    await act(async () => {
      settle(BAKE_RESULT);
    });
    await waitFor(() => expect(button).toBeEnabled());
  });

  it("reports the server's refusal instead of pretending the bake landed", async () => {
    const user = userEvent.setup();
    postBake.mockRejectedValue(new Error("Clip carries a time remap"));
    renderPanel(seed());
    await openPanel(user);

    await user.click(screen.getByRole("button", { name: /animate from audio/i }));

    expect(
      await screen.findByText(/clip carries a time remap/i)
    ).toBeInTheDocument();
  });

  it("pre-fills from an existing audio bake and offers a re-bake", async () => {
    const user = userEvent.setup();
    renderPanel(seed({ animations: [EXISTING_BAKE] }));
    await openPanel(user);

    // The bake drives opacity, so the panel has to be looking at that property
    // before it can recognise its own curve.
    await user.click(screen.getByRole("combobox", { name: /property to drive/i }));
    await user.click(screen.getByRole("option", { name: /opacity/i }));

    expect(
      screen.getByRole("button", { name: /^re-bake$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: /range quiet value/i })
    ).toHaveValue("0.4");
    expect(
      screen.getByRole("textbox", { name: /range loud value/i })
    ).toHaveValue("0.9");
    expect(screen.getByRole("textbox", { name: /^attack$/i })).toHaveValue("5");
    expect(screen.getByRole("textbox", { name: /^release$/i })).toHaveValue("90");
    expect(screen.getByRole("textbox", { name: /^offset$/i })).toHaveValue("-30");
    expect(
      screen.getByRole("img", { name: /opacity from audio curve, 3 keyframes/i })
    ).toBeInTheDocument();
  });

  it("is not offered on a clip that has nothing to animate", () => {
    const fixture = seed();
    const audioTarget: TimelineClip = { ...fixture.target, mediaType: "audio" };
    const { container } = renderPanel({ ...fixture, target: audioTarget });
    expect(container).toBeEmptyDOMElement();
  });
});
