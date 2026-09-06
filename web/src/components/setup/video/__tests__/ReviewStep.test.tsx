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
import { KNOWN_TRANSITION_TYPE_LIST } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { ReviewStep, formatSeconds, secondsText } from "../ReviewStep";

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

  // The transition is a closed set, so the row is a select and "Cut" is the
  // empty value — picking it clears the beat's transition.
  it("clears a transition when the row is set back to Cut", async () => {
    seed(beats([{ transition: "crossfade" }]));
    renderStep();
    await userEvent.click(screen.getAllByLabelText("Transition")[0]);
    await userEvent.click(await screen.findByRole("option", { name: "Cut" }));
    expect(
      useTimelineStore.getState().setup?.beats?.[0].transition
    ).toBeUndefined();
  });

  it("offers every transition the renderer knows, and no others", async () => {
    seed(beats([{ transition: "crossfade" }]));
    renderStep();
    await userEvent.click(screen.getAllByLabelText("Transition")[0]);
    const offered = (await screen.findAllByRole("option")).map(
      (option) => option.textContent
    );
    expect(offered).toEqual([
      "Cut",
      ...KNOWN_TRANSITION_TYPE_LIST.map((type) => type)
    ]);
  });

  it("numbers the beats and labels each with its length", () => {
    seed(beats());
    renderStep();
    expect(screen.getByText("1. 3s")).toBeInTheDocument();
    expect(screen.getByText("2. 4s")).toBeInTheDocument();
  });

  // F21: the field is the creator's text until it reads as a length. It never
  // answers a keystroke with a different number, and clearing it does not put
  // the old value back.
  it("keeps a cleared length field empty instead of restoring the old value", async () => {
    seed(beats());
    renderStep();
    const field = screen.getAllByLabelText("Seconds")[0];
    await userEvent.clear(field);
    expect(field).toHaveValue("");
    expect(useTimelineStore.getState().setup?.beats?.[0].duration_ms).toBe(3000);
    expect(screen.getByText(/outside 0.5–15s/)).toBeInTheDocument();
  });

  it("shows a fractional length as typed and stores that length", async () => {
    seed(beats());
    renderStep();
    const field = screen.getAllByLabelText("Seconds")[0];
    await userEvent.clear(field);
    await userEvent.type(field, "3.5");
    expect(field).toHaveValue("3.5");
    // Nothing is written until the entry has settled: mid-word, "3" is a
    // perfectly good three seconds and is not what the creator is typing.
    expect(useTimelineStore.getState().setup?.beats?.[0].duration_ms).toBe(3000);
    await userEvent.tab();
    expect(useTimelineStore.getState().setup?.beats?.[0].duration_ms).toBe(3500);
  });

  it("shows the length the plan will actually render", () => {
    seed(beats([{ duration_ms: 3500 }]));
    renderStep();
    expect(screen.getAllByLabelText("Seconds")[0]).toHaveValue("3.5");
    expect(secondsText(3000)).toBe("3");
  });

  it("keeps an out-of-range length off the plan and says the range", async () => {
    seed(beats());
    renderStep();
    const field = screen.getAllByLabelText("Seconds")[0];
    await userEvent.clear(field);
    await userEvent.type(field, "900");
    await userEvent.tab();
    expect(useTimelineStore.getState().setup?.beats?.[0].duration_ms).toBe(3000);
    expect(screen.getByText(/outside 0.5–15s/)).toBeInTheDocument();
  });

  // F20: the review advises what it can actually do, and it can drop a beat.
  it("drops a beat from the plan", async () => {
    seed(beats());
    renderStep();
    await userEvent.click(
      screen.getByRole("button", { name: "Remove beat 1" })
    );
    expect(
      useTimelineStore.getState().setup?.beats?.map((beat) => beat.id)
    ).toEqual(["b2"]);
  });

  it("keeps the last beat, so a plan is never empty", async () => {
    seed([{ id: "b1", prompt: "the kerb", duration_ms: 3000 }]);
    renderStep();
    const control = screen.getByRole("button", { name: "Remove beat 1" });
    expect(control).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(control);
    expect(useTimelineStore.getState().setup?.beats?.length).toBe(1);
  });

  // F21: removing one beat must not throw away what is being typed in another.
  it("keeps a half-typed length on the beats that stay", async () => {
    seed([
      { id: "b1", prompt: "the kerb", duration_ms: 3000 },
      { id: "b2", prompt: "the hull", duration_ms: 4000 },
      { id: "b3", prompt: "the drain", duration_ms: 2000 }
    ]);
    renderStep();
    const second = screen.getAllByLabelText("Seconds")[1];
    await userEvent.clear(second);
    // Below the shortest beat any model renders, so the click that removes
    // another beat blurs this field without writing anything.
    await userEvent.type(second, "0.1");
    await userEvent.click(
      screen.getByRole("button", { name: "Remove beat 1" })
    );
    expect(screen.getAllByLabelText("Seconds")[0]).toHaveValue("0.1");
    expect(useTimelineStore.getState().setup?.beats?.[0].duration_ms).toBe(4000);
  });

  it("advises dropping a beat, now that it offers a way to (F20)", () => {
    seed(beats([{ duration_ms: 20_000 }]));
    renderStep();
    expect(
      screen.getByText("Longer than the format. Shorten a beat or drop one.")
    ).toBeInTheDocument();
  });

  it("reads a minute as minutes and seconds", () => {
    expect(formatSeconds(64_000)).toBe("1m 04s");
    expect(formatSeconds(7000)).toBe("7s");
  });
});
