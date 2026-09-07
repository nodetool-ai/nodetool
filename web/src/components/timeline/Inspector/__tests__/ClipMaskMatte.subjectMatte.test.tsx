/**
 * The Subject matte section (D2): its four states, and that every knob writes
 * through the store action rather than patching the clip itself.
 *
 * The store actions are stubbed: what this asserts is the panel's contract
 * with them (which clip, which model, regenerate or not), not the server round
 * trip — that is `TimelineStore.generatedMatte.test.ts`.
 */

import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type { ClipGeneratedMatte, TimelineClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { ClipMaskMatte } from "../ClipMaskMatte";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";

const CLIP_ID = "shot-1";

const READY: ClipGeneratedMatte = {
  assetId: "mask-2",
  sourceAssetId: "asset-1",
  sourceRange: { fromMs: 0, toMs: 4000 },
  settings: { model: "General Use (Light)" },
  status: "ready",
  strength: 1,
  versions: [
    {
      assetId: "mask-1",
      sourceAssetId: "asset-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      settings: {}
    }
  ]
};

/** Reads the clip from the store, so a state change re-renders the section. */
const Harness: React.FC = () => {
  const clip = useTimelineStore((s) => s.clips.find((c) => c.id === CLIP_ID));
  return clip ? <ClipMaskMatte clip={clip} /> : null;
};

const renderSection = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider>
        <Harness />
      </TimelineProvider>
    </ThemeProvider>
  );

function seed(matte?: ClipGeneratedMatte, over: Partial<TimelineClip> = {}) {
  const track = makeTrack({ id: "v1", type: "video", name: "V1" });
  const clip = makeClip({
    id: CLIP_ID,
    trackId: track.id,
    name: "Shot 1",
    mediaType: "video",
    startMs: 0,
    durationMs: 4000,
    inPointMs: 0,
    currentAssetId: "asset-1",
    generatedMatte: matte,
    ...over
  });
  act(() => {
    useTimelineStore.setState({ tracks: [track], clips: [clip] });
  });
}

/** Open the "Subject matte" fold; its content is unmounted while collapsed. */
async function openSubjectMatte(
  user: ReturnType<typeof userEvent.setup>
): Promise<void> {
  const header = screen
    .queryAllByRole("button", { name: /subject matte/i })
    .find((el) => el.getAttribute("aria-expanded") === "false");
  if (header) {
    await user.click(header);
  }
}

beforeEach(() => {
  localStorage.clear();
});

describe("Subject matte — states", () => {
  it("offers Isolate subject and a model picker when there is no matte", async () => {
    const user = userEvent.setup();
    renderSection();
    seed();
    await openSubjectMatte(user);

    expect(screen.getByTestId("isolate-subject")).toBeEnabled();
    expect(
      screen.getByRole("combobox", { name: /subject matte model/i })
    ).toBeInTheDocument();
    expect(screen.queryByTestId("remove-subject-matte")).not.toBeInTheDocument();
  });

  it("shows the spinner and disables the controls while generating", async () => {
    const user = userEvent.setup();
    renderSection();
    seed({ ...READY, status: "generating" });
    await openSubjectMatte(user);

    expect(screen.getByText(/cutting the subject out/i)).toBeInTheDocument();
    expect(screen.getByTestId("regenerate-subject-matte")).toBeDisabled();
    expect(screen.getByTestId("remove-subject-matte")).toBeDisabled();
    expect(
      screen.getByRole("combobox", { name: /subject matte model/i })
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("shows the knobs, the version picker and both actions when ready", async () => {
    const user = userEvent.setup();
    renderSection();
    seed(READY);
    await openSubjectMatte(user);

    expect(screen.getByRole("slider", { name: /strength/i })).toBeEnabled();
    expect(
      screen.getByRole("textbox", { name: /subject matte feather/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /subject matte version/i })
    ).toBeInTheDocument();
    expect(screen.getByTestId("regenerate-subject-matte")).toBeEnabled();
    expect(screen.getByTestId("remove-subject-matte")).toBeEnabled();
  });

  it("names the failure and keeps the previous result when the run failed", async () => {
    const user = userEvent.setup();
    renderSection();
    seed({ ...READY, status: "failed" });
    await openSubjectMatte(user);

    expect(screen.getByText(/the last run failed/i)).toBeInTheDocument();
    expect(screen.getByTestId("regenerate-subject-matte")).toBeEnabled();
    expect(
      screen.getByRole("combobox", { name: /subject matte version/i })
    ).toBeInTheDocument();
  });

  it("offers a retry when a first run failed and cut nothing", async () => {
    const user = userEvent.setup();
    renderSection();
    seed({
      assetId: "",
      sourceAssetId: "asset-1",
      sourceRange: { fromMs: 0, toMs: 0 },
      settings: {},
      status: "failed"
    });
    await openSubjectMatte(user);

    expect(screen.getByText(/nothing was cut/i)).toBeInTheDocument();
    expect(screen.getByTestId("isolate-subject")).toBeEnabled();
    expect(
      screen.queryByRole("slider", { name: /strength/i })
    ).not.toBeInTheDocument();
  });

  it("warns and asks for a regenerate when the matte is stale", async () => {
    const user = userEvent.setup();
    renderSection();
    // The clip's asset was replaced under the matte.
    seed(READY, { currentAssetId: "asset-2" });
    await openSubjectMatte(user);

    expect(
      screen.getByText(/moved past what this matte covers/i)
    ).toBeInTheDocument();
  });

  it("is not offered for a clip with no moving picture", async () => {
    const user = userEvent.setup();
    renderSection();
    seed(undefined, { mediaType: "text" });
    await openSubjectMatte(user);

    expect(screen.queryByTestId("isolate-subject")).not.toBeInTheDocument();
  });
});

describe("Subject matte — the knobs write through the store", () => {
  it("toggles invert", async () => {
    const user = userEvent.setup();
    const setKnobs = jest.fn();
    renderSection();
    seed(READY);
    act(() => {
      useTimelineStore.setState({ setGeneratedMatteKnobs: setKnobs });
    });
    await openSubjectMatte(user);

    await user.click(screen.getByRole("switch", { name: /invert/i }));

    expect(setKnobs).toHaveBeenCalledWith(CLIP_ID, { invert: true });
  });

  it("commits a feather value", async () => {
    const user = userEvent.setup();
    const setKnobs = jest.fn();
    renderSection();
    seed(READY);
    act(() => {
      useTimelineStore.setState({ setGeneratedMatteKnobs: setKnobs });
    });
    await openSubjectMatte(user);

    const feather = screen.getByRole("textbox", {
      name: /subject matte feather/i
    });
    await user.clear(feather);
    await user.type(feather, "6");
    await user.tab();

    expect(setKnobs).toHaveBeenCalledWith(CLIP_ID, { featherPx: 6 });
  });

  it("selects a stored version", async () => {
    const user = userEvent.setup();
    const selectVersion = jest.fn();
    renderSection();
    seed(READY);
    act(() => {
      useTimelineStore.setState({
        selectGeneratedMatteVersion: selectVersion
      });
    });
    await openSubjectMatte(user);

    await user.click(
      screen.getByRole("combobox", { name: /subject matte version/i })
    );
    const options = screen.getAllByRole("option");
    await user.click(options[options.length - 1]);

    expect(selectVersion).toHaveBeenCalledWith(CLIP_ID, "mask-1");
  });

  it("removes the matte", async () => {
    const user = userEvent.setup();
    const clearMatte = jest.fn();
    renderSection();
    seed(READY);
    act(() => {
      useTimelineStore.setState({ clearGeneratedMatte: clearMatte });
    });
    await openSubjectMatte(user);

    await user.click(screen.getByTestId("remove-subject-matte"));

    expect(clearMatte).toHaveBeenCalledWith(CLIP_ID);
  });

  it("isolates with the picked model, and regenerates with the same one", async () => {
    const user = userEvent.setup();
    const isolate = jest.fn(async () => null);
    renderSection();
    seed();
    act(() => {
      useTimelineStore.setState({ isolateSubject: isolate });
    });
    await openSubjectMatte(user);

    await user.click(
      screen.getByRole("combobox", { name: /subject matte model/i })
    );
    await user.click(screen.getByRole("option", { name: "Portrait" }));
    await user.click(screen.getByTestId("isolate-subject"));

    expect(isolate).toHaveBeenCalledWith(CLIP_ID, {
      model: "Portrait",
      regenerate: false
    });

    // With a matte in place the same panel offers a regenerate instead, and it
    // runs the model the picker still holds.
    seed(READY);
    await user.click(screen.getByTestId("regenerate-subject-matte"));

    expect(isolate).toHaveBeenLastCalledWith(CLIP_ID, {
      model: "Portrait",
      regenerate: true
    });
  });
});
