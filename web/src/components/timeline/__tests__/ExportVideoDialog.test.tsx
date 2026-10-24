/**
 * ExportVideoDialog tests.
 *
 * The dialog collects the two things the browser export needs before it runs:
 * the container and whether to keep the alpha channel. MP4 has no alpha plane,
 * so the switch is disabled there and turning it on for WebM must survive the
 * trip to `onExport` — the renderer refuses `mp4` + alpha, and a switch left on
 * behind a disabled control would send a request that only throws.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { ExportVideoDialog } from "../ExportVideoDialog";
import { canEncodeMp4 } from "../render/canEncodeMp4";

jest.mock("../render/canEncodeMp4", () => ({
  canEncodeMp4: jest.fn(async () => true)
}));
const mockCanEncodeMp4 = canEncodeMp4 as jest.MockedFunction<typeof canEncodeMp4>;

const renderDialog = (onExport = jest.fn(), onClose = jest.fn()) => {
  render(
    <ThemeProvider theme={mockTheme}>
      <ExportVideoDialog open onClose={onClose} onExport={onExport} />
    </ThemeProvider>
  );
  return { onExport, onClose };
};

const alphaSwitch = () =>
  screen.getByRole("switch", {
    name: "Export with transparency"
  }) as HTMLInputElement;

const chooseFormat = (label: string): void => {
  fireEvent.mouseDown(screen.getByRole("combobox", { name: /format/i }));
  fireEvent.click(screen.getByRole("option", { name: label }));
};

const clickExport = (): void => {
  fireEvent.click(screen.getByRole("button", { name: "Export" }));
};

describe("ExportVideoDialog", () => {
  it("labels the transparency switch and disables it for MP4", () => {
    renderDialog();
    expect(alphaSwitch()).toBeDisabled();
    expect(alphaSwitch()).not.toBeChecked();
    expect(
      screen.getByText(/MP4 carries no alpha channel/i)
    ).toBeInTheDocument();
  });

  it("exports MP4 with alpha off by default", () => {
    const { onExport, onClose } = renderDialog();
    clickExport();
    expect(onExport).toHaveBeenCalledWith({ format: "mp4", alpha: false });
    expect(onClose).toHaveBeenCalled();
  });

  it("enables the switch for WebM and passes the choice to onExport", () => {
    const { onExport } = renderDialog();
    chooseFormat("WebM (VP9)");
    expect(alphaSwitch()).toBeEnabled();
    fireEvent.click(alphaSwitch());
    expect(alphaSwitch()).toBeChecked();
    clickExport();
    expect(onExport).toHaveBeenCalledWith({ format: "webm", alpha: true });
  });

  it("keeps alpha available on a PNG sequence", () => {
    const { onExport } = renderDialog();
    chooseFormat("PNG sequence (.zip)");
    fireEvent.click(alphaSwitch());
    clickExport();
    expect(onExport).toHaveBeenCalledWith({
      format: "png_sequence",
      alpha: true
    });
  });

  it("turns alpha back off when MP4 is chosen again", () => {
    const { onExport } = renderDialog();
    chooseFormat("WebM (VP9)");
    fireEvent.click(alphaSwitch());
    chooseFormat("MP4 (H.264)");
    expect(alphaSwitch()).not.toBeChecked();
    expect(alphaSwitch()).toBeDisabled();
    clickExport();
    expect(onExport).toHaveBeenCalledWith({ format: "mp4", alpha: false });
  });

  it("exports MP3 with the transparency switch off", () => {
    const { onExport } = renderDialog();
    chooseFormat("WebM (VP9)");
    fireEvent.click(alphaSwitch());
    chooseFormat("MP3 audio (320 kbps)");
    expect(alphaSwitch()).not.toBeChecked();
    expect(alphaSwitch()).toBeDisabled();
    expect(screen.getByText(/audio mixdown in stereo/i)).toBeInTheDocument();
    clickExport();
    expect(onExport).toHaveBeenCalledWith({ format: "mp3", alpha: false });
  });

  it("exports WAV with the transparency switch off", () => {
    const { onExport } = renderDialog();
    chooseFormat("WAV audio (16-bit)");
    expect(alphaSwitch()).toBeDisabled();
    expect(screen.getByText(/uncompressed at 48 kHz/i)).toBeInTheDocument();
    clickExport();
    expect(onExport).toHaveBeenCalledWith({ format: "wav", alpha: false });
  });

  // UX study 3: all three participants' default MP4 export failed in a
  // browser without an H.264 encoder, with the encoder's configuration string.
  it("turns MP4 off and starts on WebM where the browser cannot encode it", async () => {
    mockCanEncodeMp4.mockResolvedValueOnce(false);
    const { onExport } = renderDialog();
    expect(
      await screen.findByText(/This browser cannot write MP4/)
    ).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("combobox", { name: /format/i }));
    expect(screen.getByRole("option", { name: "MP4 (H.264)" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    clickExport();
    expect(onExport).toHaveBeenCalledWith({ format: "webm", alpha: false });
  });
});
