/**
 * ExportVideoDialog tests.
 *
 * The dialog collects the two things the browser export needs before it runs:
 * the container and whether to keep the alpha channel. MP4 has no alpha plane,
 * so the switch is disabled there and turning it on for WebM must survive the
 * trip to `onExport` — the renderer refuses `mp4` + alpha, and a switch left on
 * behind a disabled control would send a request that only throws.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { ExportVideoDialog } from "../ExportVideoDialog";

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
});
