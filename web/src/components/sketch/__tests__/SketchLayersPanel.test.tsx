/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, createEvent, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import SketchLayersPanel from "../SketchLayersPanel";
import { createDefaultLayer } from "../types";
import type { BlendMode } from "../types";

function renderPanel(blendMode: BlendMode = "normal") {
  const theme = createTheme({
    cssVariables: true
  });
  const layer = createDefaultLayer("Layer 1", "raster", 64, 64);
  layer.blendMode = blendMode;
  const props = {
    foregroundColor: "#ffffff",
    onForegroundColorChange: jest.fn(),
    layers: [layer],
    activeLayerId: layer.id,
    selectedLayerIds: [layer.id],
    maskLayerId: null,
    isolatedLayerId: null,
    onSelectLayer: jest.fn(),
    onToggleLayerInSelection: jest.fn(),
    onSelectLayerRangeInPanelOrder: jest.fn(),
    onToggleVisibility: jest.fn(),
    onAddLayer: jest.fn(),
    onRemoveLayer: jest.fn(),
    onDuplicateLayer: jest.fn(),
    onReorderLayers: jest.fn(),
    onSetMaskLayer: jest.fn(),
    onToggleAlphaLock: jest.fn(),
    onToggleIsolateLayer: jest.fn(),
    onToggleExposedInput: jest.fn(),
    onToggleExposedOutput: jest.fn(),
    onLayerOpacityChange: jest.fn(),
    onLayerBlendModeChange: jest.fn(),
    onRenameLayer: jest.fn(),
    onClearLayer: jest.fn(),
    onFlipHorizontal: jest.fn(),
    onFlipVertical: jest.fn(),
    onMergeDown: jest.fn(),
    onFlattenVisible: jest.fn(),
    onTrimLayerToBounds: jest.fn(),
    onCropCanvasToActiveLayerVisiblePixels: jest.fn(),
    onCropCanvasToActiveLayerExtents: jest.fn(),
    canvasWidth: 64,
    canvasHeight: 64,
    onCanvasResize: jest.fn(),
    canvasResizeHandlesEnabled: false,
    onCanvasResizeHandlesEnabledChange: jest.fn(),
    onAddGroup: jest.fn(),
    onToggleGroupCollapsed: jest.fn(),
    onMoveLayerToGroup: jest.fn(),
    onUngroupLayer: jest.fn(),
    onGroupSelectedLayers: jest.fn(),
    onDeleteSelectedLayers: jest.fn()
  };

  render(
    <ThemeProvider theme={theme}>
      <SketchLayersPanel {...props} />
    </ThemeProvider>
  );

  return { layer, props };
}

describe("SketchLayersPanel blend mode quick cycling", () => {
  it("cycles blend mode directly with arrow keys without opening the menu", () => {
    const { layer, props } = renderPanel();
    const combobox = screen.getByRole("combobox");

    const keydown = createEvent.keyDown(combobox, { key: "ArrowDown" });
    fireEvent(combobox, keydown);

    expect(keydown.defaultPrevented).toBe(true);
    expect(props.onLayerBlendModeChange).toHaveBeenCalledWith(
      layer.id,
      "multiply"
    );
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("cycles blend mode directly with the mouse wheel while hovering", () => {
    const { layer, props } = renderPanel();
    const combobox = screen.getByRole("combobox");

    const wheel = createEvent.wheel(combobox, { deltaY: 100 });
    fireEvent(combobox, wheel);

    expect(props.onLayerBlendModeChange).toHaveBeenCalledWith(
      layer.id,
      "multiply"
    );
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("does not wrap past the first blend mode", () => {
    const { props } = renderPanel("normal");
    const combobox = screen.getByRole("combobox");

    fireEvent.keyDown(combobox, { key: "ArrowUp" });
    fireEvent.wheel(combobox, { deltaY: -100 });

    expect(props.onLayerBlendModeChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
