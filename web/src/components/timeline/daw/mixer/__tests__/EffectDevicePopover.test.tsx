/**
 * The device popover gives a device view the width it was drawn for. A view
 * lays itself out by container queries and has no intrinsic width, so a
 * `max-content` popover collapsed it to its narrowest control.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import type { TrackEffect } from "@nodetool-ai/timeline";

import mockTheme from "../../../../../__mocks__/themeMock";
import {
  TimelineProvider,
  createTimelineInstance
} from "../../../../../stores/timeline/TimelineInstance";
import { makeFableEffect } from "../../fx/fableFxParams";
import { EffectDevicePopover } from "../EffectDevicePopover";

jest.mock("../../devices/registerDeviceViews", () => ({}));
jest.mock("../../devices/deviceViews", () => ({
  fxView: (key: string) =>
    key.startsWith("fable:") ? () => <div data-testid="device-view" /> : null
}));

function renderPopover(effect: TrackEffect): void {
  const instance = createTimelineInstance();
  instance.doc.setState({ tracks: [], clips: [], master: { volumeDb: 0, effects: [effect] } });
  const anchor = document.createElement("button");
  document.body.appendChild(anchor);
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider instance={instance}>
        <EffectDevicePopover
          open={{ trackId: null, effectId: effect.id, anchor }}
          onClose={() => undefined}
        />
      </TimelineProvider>
    </ThemeProvider>
  );
}

const paperOf = (element: HTMLElement): HTMLElement => {
  const paper = element.closest(".MuiPopover-paper");
  if (!(paper instanceof HTMLElement)) throw new Error("no popover paper");
  return paper;
};

describe("EffectDevicePopover", () => {
  it("opens a FableSynth device at the width the dock gives it", () => {
    renderPopover({ ...makeFableEffect("ott"), id: "fx-ott" });
    const paper = paperOf(screen.getByTestId("device-view"));
    expect(getComputedStyle(paper).width).toBe("440px");
  });

  it("keeps a built-in effect's editor at its natural width", () => {
    renderPopover({ id: "fx-gain", type: "gain", enabled: true, gainDb: 0 } as TrackEffect);
    const paper = paperOf(screen.getByRole("heading", { name: "Gain" }));
    expect(getComputedStyle(paper).width).toBe("max-content");
  });
});
