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
  const onCancel = jest.fn();
  render(
    <ThemeProvider theme={mockTheme}>
      <VoiceRecordingBar
        levelsRef={levelsRef}
        durationMs={0}
        isTranscribing={false}
        onCancel={onCancel}
        {...props}
      />
    </ThemeProvider>
  );
  return { onCancel };
};

describe("formatDuration", () => {
  it("renders mm:ss", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(9_400)).toBe("0:09");
    expect(formatDuration(65_000)).toBe("1:05");
  });
});

describe("VoiceRecordingBar", () => {
  it("shows the cancel button on the left and timer while recording", async () => {
    const { onCancel } = renderBar({ durationMs: 3_000 });
    expect(screen.getByText("0:03")).toBeInTheDocument();

    const cancelButton = screen.getByRole("button", {
      name: "Discard recording"
    });
    await userEvent.click(cancelButton);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("shows transcribing status and keeps the cancel button active while transcribing", async () => {
    const { onCancel } = renderBar({ isTranscribing: true });
    expect(screen.getByText("Transcribing…")).toBeInTheDocument();

    const cancelButton = screen.getByRole("button", {
      name: "Cancel transcription"
    });
    await userEvent.click(cancelButton);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("shows pending send status while transcribing with pendingSend", async () => {
    const { onCancel } = renderBar({
      isTranscribing: true,
      pendingSend: true
    });
    expect(screen.getByText("Sending once transcribed…")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Cancel transcription" })
    );
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
