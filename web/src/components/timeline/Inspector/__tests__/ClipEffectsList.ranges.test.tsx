/**
 * ClipEffectsList numeric ranges: lift/gamma/gain per-channel fields refuse
 * values the renderer cannot use (gamma ≤ 0, gain < 0) and keep lift free.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import type { ClipEffect, TimelineClip } from "@nodetool-ai/timeline";
import { makeClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { ClipEffectsList } from "../ClipEffectsList";
import { openPersistedFold } from "../usePersistedFold";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";

const lgg: ClipEffect = {
  id: "fx_lgg",
  type: "liftGammaGain",
  enabled: true,
  lift: [0, 0, 0],
  gamma: [1, 1, 1],
  gain: [1, 1, 1]
};

const patchClip = jest.fn();

beforeEach(() => {
  localStorage.clear();
  openPersistedFold("effects");
  patchClip.mockReset();
  useTimelineStore.setState({ patchClip });
});

function renderList(): void {
  const clip: TimelineClip = {
    ...makeClip({ trackId: "t1", mediaType: "video", startMs: 0, durationMs: 1000 }),
    effects: [lgg]
  };
  render(<ThemeProvider theme={mockTheme}><ClipEffectsList clip={clip} /></ThemeProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Lift / gamma / gain" }));
}

function commit(label: string, raw: string): void {
  const input = screen.getByRole("textbox", { name: label });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: raw } });
  fireEvent.blur(input);
}

describe("ClipEffectsList lift/gamma/gain", () => {
  it("refuses a gamma of 0 or below", () => {
    renderList();
    commit("Lift / gamma / gain Gamma R", "0");
    commit("Lift / gamma / gain Gamma G", "-1");
    expect(patchClip).not.toHaveBeenCalled();

    commit("Lift / gamma / gain Gamma B", "0.5");
    expect(patchClip).toHaveBeenCalledTimes(1);
  });

  it("refuses a negative gain but accepts 0", () => {
    renderList();
    commit("Lift / gamma / gain Gain R", "-0.5");
    expect(patchClip).not.toHaveBeenCalled();
    commit("Lift / gamma / gain Gain R", "0");
    expect(patchClip).toHaveBeenCalledTimes(1);
  });

  it("accepts a negative lift", () => {
    renderList();
    commit("Lift / gamma / gain Lift R", "-0.2");
    expect(patchClip).toHaveBeenCalledTimes(1);
  });
});

describe("ClipEffectsList grain", () => {
  it("shows defaults for saved grain and writes roughness and softness edits", () => {
    const grain: ClipEffect = {
      id: "fx_grain", type: "grain", enabled: true, amount: 0.25
    };
    const clip: TimelineClip = {
      ...makeClip({ trackId: "t1", mediaType: "video", startMs: 0, durationMs: 1000 }),
      effects: [grain]
    };
    render(<ThemeProvider theme={mockTheme}><ClipEffectsList clip={clip} /></ThemeProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Film grain" }));

    const roughness = screen.getByRole("slider", { name: "Roughness" });
    const softness = screen.getByRole("slider", { name: "Softness" });
    expect(roughness).toHaveAttribute("aria-valuenow", "0.5");
    expect(softness).toHaveAttribute("aria-valuenow", "0.25");
    expect(roughness).toHaveAttribute("aria-valuemin", "0");
    expect(roughness).toHaveAttribute("aria-valuemax", "1");
    expect(softness).toHaveAttribute("aria-valuemin", "0");
    expect(softness).toHaveAttribute("aria-valuemax", "1");

    fireEvent.change(roughness, { target: { value: "0.7" } });
    expect(patchClip).toHaveBeenLastCalledWith(clip.id, {
      effects: [{ ...grain, roughness: 0.7 }]
    });
    fireEvent.change(softness, { target: { value: "0.4" } });
    expect(patchClip).toHaveBeenLastCalledWith(clip.id, {
      effects: [{ ...grain, softness: 0.4 }]
    });
  });
});
