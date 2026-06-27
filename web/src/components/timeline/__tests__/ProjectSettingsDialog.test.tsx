/**
 * ProjectSettingsDialog tests.
 *
 * The dialog edits the sequence-level canvas size + frame rate. It seeds its
 * draft from the store on open, lets a resolution preset fill width/height, and
 * persists via useTimelineProjectSettings. Apply is gated on valid + changed
 * values.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { ProjectSettingsDialog } from "../ProjectSettingsDialog";

// ── Store + persistence hook mocks ───────────────────────────────────────────

let storeState = { fps: 30, width: 1920, height: 1080 };

jest.mock("../../../stores/timeline/TimelineStore", () => ({
  useTimelineStore: (selector: (s: typeof storeState) => unknown) =>
    selector(storeState)
}));

const mockSave = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../hooks/timeline/useTimelineProjectSettings", () => ({
  useTimelineProjectSettings: () => ({ save: mockSave, isSaving: false })
}));

const renderDialog = (onClose = jest.fn()) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ProjectSettingsDialog open onClose={onClose} />
    </ThemeProvider>
  );

const widthInput = () =>
  screen.getByRole("spinbutton", { name: /width/i }) as HTMLInputElement;
const heightInput = () =>
  screen.getByRole("spinbutton", { name: /height/i }) as HTMLInputElement;
const fpsInput = () =>
  screen.getByRole("spinbutton", { name: /fps/i }) as HTMLInputElement;

beforeEach(() => {
  jest.clearAllMocks();
  storeState = { fps: 30, width: 1920, height: 1080 };
});

describe("ProjectSettingsDialog", () => {
  it("seeds the draft from the store", () => {
    renderDialog();
    expect(widthInput().value).toBe("1920");
    expect(heightInput().value).toBe("1080");
    expect(fpsInput().value).toBe("30");
  });

  it("disables Apply when nothing has changed", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  it("persists edited width, height and fps on Apply", async () => {
    const onClose = jest.fn();
    renderDialog(onClose);

    fireEvent.change(widthInput(), { target: { value: "1080" } });
    fireEvent.change(heightInput(), { target: { value: "1920" } });
    fireEvent.change(fpsInput(), { target: { value: "60" } });

    const apply = screen.getByRole("button", { name: "Apply" });
    expect(apply).toBeEnabled();
    fireEvent.click(apply);

    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith({
        width: 1080,
        height: 1920,
        fps: 60
      })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("keeps Apply disabled for an out-of-range dimension", () => {
    renderDialog();
    fireEvent.change(widthInput(), { target: { value: "4" } }); // below MIN_DIM
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(mockSave).not.toHaveBeenCalled();
  });
});
