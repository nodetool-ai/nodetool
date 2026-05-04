/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import SketchCanvasContextMenu from "../SketchCanvasContextMenu";
import { useSketchStore } from "../state/useSketchStore";

function renderContextMenu() {
  const theme = createTheme({ cssVariables: true });
  const onClose = jest.fn();
  const onNewLayer = jest.fn();
  const toolSettings = useSketchStore.getState().toolSettings;

  render(
    <ThemeProvider theme={theme}>
      <SketchCanvasContextMenu
        open
        position={{ x: 120, y: 80 }}
        activeTool="select"
        brushSettings={toolSettings.brush}
        pencilSettings={toolSettings.pencil}
        eraserSettings={toolSettings.eraser}
        shapeSettings={toolSettings.shape}
        fillSettings={toolSettings.fill}
        blurSettings={toolSettings.blur}
        gradientSettings={toolSettings.gradient}
        cloneStampSettings={toolSettings.cloneStamp}
        foregroundColor="#000000"
        backgroundColor="#ffffff"
        canUndo
        canRedo={false}
        onClose={onClose}
        onToolChange={jest.fn()}
        onBrushSettingsChange={jest.fn()}
        onPencilSettingsChange={jest.fn()}
        onEraserSettingsChange={jest.fn()}
        onShapeSettingsChange={jest.fn()}
        onFillSettingsChange={jest.fn()}
        onBlurSettingsChange={jest.fn()}
        onGradientSettingsChange={jest.fn()}
        onCloneStampSettingsChange={jest.fn()}
        selectSettings={toolSettings.select}
        hasActiveSelection
        onSelectSettingsChange={jest.fn()}
        onInvertSelection={jest.fn()}
        onCropCanvasToSelection={jest.fn()}
        onFeatherSelection={jest.fn()}
        onSmoothSelectionBorders={jest.fn()}
        onStrokeSelectionBorder={jest.fn()}
        onDeselectSelection={jest.fn()}
        onReselectSelection={jest.fn()}
        onFillSelectionWithForeground={jest.fn()}
        onNewLayer={onNewLayer}
        onLayerViaCopy={jest.fn()}
        onLayerViaCut={jest.fn()}
        onFreeTransform={jest.fn()}
        onSwapColors={jest.fn()}
        onUndo={jest.fn()}
        onRedo={jest.fn()}
        onClearLayer={jest.fn()}
        onExportPng={jest.fn()}
      />
    </ThemeProvider>
  );

  return { onClose, onNewLayer };
}

describe("SketchCanvasContextMenu", () => {
  it("opens a new-layer submenu and forwards the selected layer type", async () => {
    const user = userEvent.setup();
    const { onClose, onNewLayer } = renderContextMenu();

    await user.click(screen.getByRole("button", { name: "New Layer..." }));
    expect(await screen.findByRole("button", { name: "Raster Layer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mask Layer" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mask Layer" }));

    await waitFor(() => {
      expect(onNewLayer).toHaveBeenCalledWith("mask");
      expect(onClose).toHaveBeenCalled();
    });
  });
});
