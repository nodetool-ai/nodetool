import React, { useRef } from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import { VoiceInputControl } from "../VoiceInputControl";
import type { VoiceInputPhase } from "../useVoiceInput";
import mockTheme from "../../../../../__mocks__/themeMock";

const startRecording = jest.fn();
const confirmRecording = jest.fn();
const cancelRecording = jest.fn();
let phase: VoiceInputPhase = "idle";

jest.mock("../useVoiceInput", () => ({
  useVoiceInput: () => ({
    phase,
    durationMs: 2_000,
    levelsRef: { current: new Float32Array(8) },
    startRecording,
    confirmRecording,
    cancelRecording,
    isConfigOpen: false,
    closeConfig: jest.fn(),
    selectModel: jest.fn()
  })
}));

jest.mock("../../../../model_menu/ASRModelMenuDialog", () => ({
  __esModule: true,
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="asr-dialog" /> : null
}));

// The composer card the recording bar is portalled into.
function Host() {
  const cardRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={cardRef} data-testid="compose-card">
      <div data-testid="footer">
        <VoiceInputControl onTranscript={jest.fn()} overlayHost={cardRef} />
      </div>
    </div>
  );
}

const renderControl = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <Host />
    </ThemeProvider>
  );

describe("VoiceInputControl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    phase = "idle";
  });

  it("starts a recording from the mic button", async () => {
    renderControl();
    await userEvent.click(
      screen.getByRole("button", { name: "Record voice message" })
    );
    expect(startRecording).toHaveBeenCalled();
  });

  it("shows no recording bar while idle", () => {
    renderControl();
    expect(screen.queryByRole("group", { name: "Voice recording" })).toBeNull();
  });

  it("covers the composer card with the bar while recording", () => {
    phase = "recording";
    renderControl();
    const bar = screen.getByRole("group", { name: "Voice recording" });
    // The bar belongs to the card, not to the footer the button sits in.
    expect(screen.getByTestId("compose-card")).toContainElement(bar);
    expect(screen.getByTestId("footer")).not.toContainElement(bar);
    expect(
      screen.getByRole("button", { name: "Record voice message" })
    ).toBeDisabled();
  });
});
