import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import { VoiceRecordingBar, formatDuration } from "../VoiceRecordingBar";
import mockTheme from "../../../../../__mocks__/themeMock";

const levelsRef = { current: new Float32Array(8) };

const renderBar = (
  props: Partial<React.ComponentProps<typeof VoiceRecordingBar>> = {}
) => {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  render(
    <ThemeProvider theme={mockTheme}>
      <VoiceRecordingBar
        levelsRef={levelsRef}
        durationMs={0}
        isTranscribing={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
        {...props}
      />
    </ThemeProvider>
  );
  return { onConfirm, onCancel };
};

describe("formatDuration", () => {
  it("renders mm:ss", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(9_400)).toBe("0:09");
    expect(formatDuration(65_000)).toBe("1:05");
  });
});

describe("VoiceRecordingBar", () => {
  it("offers accept and discard while recording", async () => {
    const { onConfirm, onCancel } = renderBar({ durationMs: 3_000 });
    expect(screen.getByText("0:03")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Accept recording" }));
    expect(onConfirm).toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: "Discard recording" })
    );
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows only the transcription status once the take is accepted", () => {
    renderBar({ isTranscribing: true });
    expect(screen.getByText("Transcribing…")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Accept recording" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Discard recording" })
    ).not.toBeInTheDocument();
  });
});
