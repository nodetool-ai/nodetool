/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import SketchCanvasContextMenu from "../SketchCanvasContextMenu";

function renderContextMenu() {
  const theme = createTheme({ cssVariables: true });
  const onClose = jest.fn();
  const onNewLayer = jest.fn();

  render(
    <ThemeProvider theme={theme}>
      <SketchCanvasContextMenu
        open
        position={{ x: 120, y: 80 }}
        activeTool="select"
        brushSettings={{ size: 10, hardness: 1, opacity: 1, spacing: 0.1, flow: 1, smoothing: 0, blendMode: "normal" }}
        pencilSettings={{ size: 1, opacity: 1, spacing: 1, smoothing: 0 }}
        eraserSettings={{ size: 10, hardness: 1, opacity: 1, spacing: 0.1, flow: 1, smoothing: 0 }}
        shapeSettings={{ strokeColor: "#000000", fillColor: "#ffffff", strokeWidth: 1, fill: true, constrainProportions: false }}
        fillSettings={{ tolerance: 0, contiguous: true, sampleAllLayers: false }}
        blurSettings={{ size: 8, strength: 0.5 }}
        gradientSettings={{ startColor: "#000000", endColor: "#ffffff", opacity: 1, type: "linear" }}
        cloneStampSettings={{ size: 10, hardness: 1, opacity: 1, aligned: true, sampleAllLayers: false }}
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
        selectSettings={{ mode: "rectangle", magicWandTolerance: 0, featherRadius: 0, borderWidth: 1 }}
        hasActiveSelection
        onSelectSettingsChange={jest.fn()}
        onInvertSelection={jest.fn()}
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
