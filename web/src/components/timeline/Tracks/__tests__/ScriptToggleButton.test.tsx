/**
 * ScriptToggleButton — the timeline toolbar control that adds/removes the
 * optional script feature. When the script is off it offers "Add script" and
 * flips scriptEnabled true; when on it offers "Remove script" and flips it
 * false. Flipping false is non-destructive (it only changes the flag).
 */

import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { ScriptToggleButton } from "../ScriptToggleButton";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";

const renderButton = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider>
        <ScriptToggleButton />
      </TimelineProvider>
    </ThemeProvider>
  );

describe("ScriptToggleButton", () => {
  it("shows 'Add script' and enables the script on click when off", () => {
    renderButton();
    act(() => {
      useTimelineStore.getState().setScriptEnabled(false);
    });

    const button = screen.getByTestId("script-toggle-button");
    expect(button).toHaveTextContent(/add script/i);
    expect(button).toHaveAttribute("aria-label", expect.stringMatching(/add/i));

    act(() => {
      fireEvent.click(button);
    });
    expect(useTimelineStore.getState().scriptEnabled).toBe(true);
  });

  it("shows 'Remove script' and disables the script on click when on", () => {
    renderButton();
    act(() => {
      useTimelineStore.getState().setScriptEnabled(true);
    });

    const button = screen.getByTestId("script-toggle-button");
    expect(button).toHaveTextContent(/remove script/i);
    expect(button).toHaveAttribute(
      "aria-label",
      expect.stringMatching(/remove/i)
    );

    act(() => {
      fireEvent.click(button);
    });
    expect(useTimelineStore.getState().scriptEnabled).toBe(false);
  });

  it("removing the script does not delete clips (only flips the flag)", () => {
    renderButton();
    act(() => {
      useTimelineStore.getState().setScriptEnabled(true);
    });
    const clipsBefore = useTimelineStore.getState().clips;

    act(() => {
      fireEvent.click(screen.getByTestId("script-toggle-button"));
    });

    expect(useTimelineStore.getState().scriptEnabled).toBe(false);
    expect(useTimelineStore.getState().clips).toBe(clipsBefore);
  });
});
