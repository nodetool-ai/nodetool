/**
 * @jest-environment jsdom
 */
/**
 * Tool-settings collapse in the top bar: the caret hides/shows the settings
 * row, and narrow viewports start collapsed so the settings don't eat the
 * canvas on a phone.
 */

import { stub } from "../../../test-utils/doubles";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import { ConnectedToolTopBar } from "../editor-shell/ConnectedToolTopBar";
import type { ConnectedToolTopBarProps } from "../editor-shell/ConnectedToolTopBar";
import { useSketchStore } from "../state";
import type { useSegmentation } from "../hooks/useSegmentation";

const mockIsMobile = jest.fn(() => false);
jest.mock("../hooks/useSketchIsMobile", () => ({
  useSketchIsMobile: () => mockIsMobile()
}));

const segmentation = stub<ReturnType<typeof useSegmentation>>({
  status: "idle",
  modelInfo: null,
  applyResult: jest.fn(),
  discardResult: jest.fn(),
  cancelSegmentation: jest.fn(),
  checkModel: jest.fn()
});

const props: ConnectedToolTopBarProps = {
  adjBrightness: 0,
  adjContrast: 0,
  adjSaturation: 0,
  onAdjustBrightnessChange: jest.fn(),
  onAdjustContrastChange: jest.fn(),
  onAdjustSaturationChange: jest.fn(),
  onAdjustApply: jest.fn(),
  onAdjustCancel: jest.fn(),
  onTransformCommit: jest.fn(),
  onTransformCancel: jest.fn(),
  onTransformReset: jest.fn(),
  segmentation,
  onRunSegmentation: jest.fn(),
  onClearSegmentPrompts: jest.fn(),
  onCropCanvasToSelection: jest.fn(),
  onCropCommit: jest.fn(),
  onCropCancelPreview: jest.fn()
};

function renderBar() {
  return render(
    <ThemeProvider theme={createTheme({ cssVariables: true })}>
      <ConnectedToolTopBar {...props} />
    </ThemeProvider>
  );
}

beforeEach(() => {
  mockIsMobile.mockReturnValue(false);
  useSketchStore.setState((s) => ({
    ...s,
    panelsHidden: false,
    toolSettingsCollapsed: false
  }));
  useSketchStore.getState().setActiveTool("brush");
});

describe("tool-settings collapse", () => {
  it("shows the settings expanded on desktop", () => {
    renderBar();
    expect(screen.getByText("Brush")).toBeTruthy();
    expect(screen.getByLabelText("Hide tool settings")).toBeTruthy();
    expect(screen.getByText("Size")).toBeTruthy();
  });

  it("hides the settings when the caret is tapped, keeping the header", async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByTestId("sketch-toggle-tool-settings"));

    expect(useSketchStore.getState().toolSettingsCollapsed).toBe(true);
    expect(screen.queryByText("Size")).toBeNull();
    expect(screen.getByText("Brush")).toBeTruthy();
    expect(screen.getByLabelText("Show tool settings")).toBeTruthy();
  });

  it("starts collapsed on a narrow viewport", () => {
    mockIsMobile.mockReturnValue(true);
    renderBar();

    expect(useSketchStore.getState().toolSettingsCollapsed).toBe(true);
    expect(screen.queryByText("Size")).toBeNull();
    expect(screen.getByTestId("sketch-toggle-tool-settings")).toBeTruthy();
  });
});
