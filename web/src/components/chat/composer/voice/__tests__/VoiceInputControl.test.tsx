import { useRef } from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import { VoiceInputControl } from "../VoiceInputControl";
import type { UseVoiceInputReturn, VoiceInputPhase } from "../useVoiceInput";
import mockTheme from "../../../../../__mocks__/themeMock";

const startRecording = jest.fn();
const toggleRecording = jest.fn();
const confirmRecording = jest.fn();
const requestSend = jest.fn(() => false);
const cancelRecording = jest.fn();
let phase: VoiceInputPhase = "idle";
let pendingSend = false;

const createMockVoice = (): Readonly<UseVoiceInputReturn> => ({
  phase,
  durationMs: 2_000,
  levelsRef: { current: new Float32Array(8) },
  pendingSend,
  startRecording,
  toggleRecording,
  confirmRecording,
  requestSend,
  cancelRecording,
  isConfigOpen: false,
  closeConfig: jest.fn(),
  selectModel: jest.fn()
});

jest.mock("../useVoiceInput", () => ({
  useVoiceInput: () => createMockVoice()
}));

jest.mock("../../../../model_menu/ASRModelMenuDialog", () => ({
  __esModule: true,
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="asr-dialog" /> : null
}));

function Host({
  disabled = false,
  controlled = false
}: {
  disabled?: boolean;
  controlled?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={cardRef} data-testid="compose-card">
      <div data-testid="footer">
        {controlled ? (
          <VoiceInputControl
            voice={createMockVoice()}
            shortcutHost={cardRef}
            disabled={disabled}
          />
        ) : (
          <VoiceInputControl
            onTranscript={jest.fn()}
            overlayHost={cardRef}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
}

const renderControl = (props?: { disabled?: boolean; controlled?: boolean }) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <Host {...props} />
    </ThemeProvider>
  );

describe("VoiceInputControl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    phase = "idle";
    pendingSend = false;
  });

  it("toggles recording from the mic button when idle", async () => {
    renderControl();
    await userEvent.click(
      screen.getByRole("button", { name: "Record voice message" })
    );
    expect(toggleRecording).toHaveBeenCalledTimes(1);
  });

  it("shows no recording bar while idle", () => {
    renderControl();
    expect(screen.queryByRole("group", { name: "Voice recording" })).toBeNull();
  });

  it("keeps the same mic button enabled and active to stop recording", async () => {
    phase = "recording";
    renderControl();

    const bar = screen.getByRole("group", { name: "Voice recording" });
    expect(screen.getByTestId("compose-card")).toContainElement(bar);
    expect(screen.getByTestId("footer")).not.toContainElement(bar);

    const stopButton = screen.getByRole("button", { name: "Stop recording" });
    expect(stopButton).toBeEnabled();
    expect(stopButton).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(stopButton);
    expect(toggleRecording).toHaveBeenCalledTimes(1);
  });

  it("disables the mic button while transcribing and keeps cancel available", async () => {
    phase = "transcribing";
    renderControl();

    expect(
      screen.getByRole("button", { name: "Record voice message" })
    ).toBeDisabled();
    expect(screen.getByText("Transcribing…")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Cancel transcription" })
    );
    expect(cancelRecording).toHaveBeenCalledTimes(1);
  });

  it("toggles dictation with Alt+Shift+M when idle and while recording", () => {
    const { rerender } = renderControl();

    fireEvent.keyDown(window, {
      code: "KeyM",
      key: "M",
      altKey: true,
      shiftKey: true
    });
    expect(toggleRecording).toHaveBeenCalledTimes(1);

    phase = "recording";
    rerender(
      <ThemeProvider theme={mockTheme}>
        <Host />
      </ThemeProvider>
    );

    fireEvent.keyDown(window, {
      code: "KeyM",
      key: "M",
      altKey: true,
      shiftKey: true
    });
    expect(toggleRecording).toHaveBeenCalledTimes(2);
  });

  it("ignores Alt+Shift+M when Ctrl or Meta is pressed, when disabled, or while transcribing", () => {
    renderControl();

    fireEvent.keyDown(window, {
      code: "KeyM",
      key: "M",
      altKey: true,
      shiftKey: true,
      ctrlKey: true
    });
    fireEvent.keyDown(window, {
      code: "KeyM",
      key: "M",
      altKey: true,
      shiftKey: true,
      metaKey: true
    });
    expect(toggleRecording).not.toHaveBeenCalled();

    phase = "transcribing";
    renderControl();
    fireEvent.keyDown(window, {
      code: "KeyM",
      key: "M",
      altKey: true,
      shiftKey: true
    });
    expect(toggleRecording).not.toHaveBeenCalled();
  });

  it("ignores Alt+Shift+M when disabled", () => {
    renderControl({ disabled: true });

    fireEvent.keyDown(window, {
      code: "KeyM",
      key: "M",
      altKey: true,
      shiftKey: true
    });
    expect(toggleRecording).not.toHaveBeenCalled();
  });

  it("displays the Alt+Shift+M shortcut in the mic button tooltip", async () => {
    const user = userEvent.setup();
    renderControl();

    await user.hover(
      screen.getByRole("button", { name: "Record voice message" })
    );

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Record voice message");
    expect(tooltip).toHaveTextContent("Alt");
    expect(tooltip).toHaveTextContent("M");
  });

  it("does not portal a duplicate recording bar when controlled by the parent", () => {
    phase = "recording";
    renderControl({ controlled: true });

    expect(screen.queryByRole("group", { name: "Voice recording" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Stop recording" })
    ).toBeEnabled();
  });
});
