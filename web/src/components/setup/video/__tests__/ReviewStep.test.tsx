/**
 * PRD § 8.7 criterion 4: the review shows the duration sum against the format,
 * and edits round-trip to `setup.beats`.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import type { TimelineBeat } from "@nodetool-ai/timeline";
import { ReviewStep, formatSeconds } from "../ReviewStep";

const beats = (over: Partial<TimelineBeat>[] = []): TimelineBeat[] =>
  [
    { id: "b1", prompt: "the kerb", duration_ms: 3000 },
    { id: "b2", prompt: "the hull", duration_ms: 4000, voiceover: "Gone." }
  ].map((beat, index) => ({ ...beat, ...(over[index] ?? {}) }));

const seed = (plan: TimelineBeat[], format = "ad-15") => {
  useTimelineStore.getState().setSetup({
    stage: "review",
    brief: "a paper boat",
    format,
    beats: plan
  });
};

// No `TimelineProvider`: the step reads the shared default instance, which is
// the one `useTimelineStore.getState()` seeds. A provider would hand the step a
// fresh, empty instance instead.
const renderStep = (replan = jest.fn()) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ReviewStep onReplan={replan} />
    </ThemeProvider>
  );

beforeEach(() => {
  useTimelineStore.getState().reset();
});

describe("video ReviewStep (criterion 4)", () => {
  it("shows the beat total against the format's length", () => {
    seed(beats());
    renderStep();
    // 3s + 4s of a 15s ad.
    expect(screen.getByText("7s of 15s")).toBeInTheDocument();
  });

  it("warns once the plan runs longer than the format", () => {
    seed(beats([{ duration_ms: 20_000 }]));
    renderStep();
    expect(screen.getByText("24s of 15s")).toBeInTheDocument();
    expect(
      screen.getByText(/Longer than the format/i)
    ).toBeInTheDocument();
  });

  it("says nothing about length when the plan fits", () => {
    seed(beats());
    renderStep();
    expect(screen.queryByText(/Longer than the format/i)).toBeNull();
  });

  it("round-trips a prompt edit to setup.beats", async () => {
    seed(beats());
    renderStep();
    const field = screen.getAllByLabelText("Beat")[0];
    await userEvent.type(field, "!");
    expect(useTimelineStore.getState().setup?.beats?.[0].prompt).toBe(
      "the kerb!"
    );
  });

  it("round-trips a voiceover edit to setup.beats", async () => {
    seed(beats());
    renderStep();
    const field = screen.getAllByLabelText("Voiceover")[1];
    await userEvent.type(field, "!");
    expect(useTimelineStore.getState().setup?.beats?.[1].voiceover).toBe(
      "Gone.!"
    );
  });

  it("clears a transition when the field is emptied", async () => {
    seed(beats([{ transition: "crossfade" }]));
    renderStep();
    const field = screen.getAllByLabelText("Transition")[0];
    await userEvent.clear(field);
    expect(
      useTimelineStore.getState().setup?.beats?.[0].transition
    ).toBeUndefined();
  });

  it("numbers the beats and labels each with its length", () => {
    seed(beats());
    renderStep();
    expect(screen.getByText("1. 3s")).toBeInTheDocument();
    expect(screen.getByText("2. 4s")).toBeInTheDocument();
  });

  it("reads a minute as minutes and seconds", () => {
    expect(formatSeconds(64_000)).toBe("1m 04s");
    expect(formatSeconds(7000)).toBe("7s");
  });
});
