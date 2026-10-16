/**
 * @jest-environment jsdom
 */
import { render, screen, createEvent, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import SketchLayersPanel from "../SketchLayersPanel";
import { createDefaultLayer } from "../types";
import type { BlendMode } from "../types";
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";

// Media sources resolve through TanStack Query; these suites render no
// QueryClientProvider, so use the manual mock (resolution itself is covered
// by hooks/__tests__/useResolvedMediaUri.test.tsx).
jest.mock("../../../hooks/useResolvedMediaUri");

function buildPanelProps({
  blendMode = "normal",
  layerCount = 1,
  selectedLayerIds,
  activeLayerIndex = 0,
  visibleByIndex
}: {
  blendMode?: BlendMode;
  layerCount?: number;
  selectedLayerIds?: string[];
  activeLayerIndex?: number;
  visibleByIndex?: boolean[];
} = {}) {
  const theme = createTheme({
    cssVariables: true
  });
    const layers = Array.from({ length: layerCount }, (_, index) => {
      const layer = createDefaultLayer(`Layer ${index + 1}`, "raster", 64, 64);
      layer.blendMode = index === activeLayerIndex ? blendMode : "normal";
      if (visibleByIndex?.[index] !== undefined) {
        layer.visible = visibleByIndex[index];
      }
      return layer;
    });
  const layer = layers[activeLayerIndex];
  const props = {
    foregroundColor: "#ffffff",
    onForegroundColorChange: jest.fn(),
    layers,
    activeLayerId: layer.id,
    selectedLayerIds: selectedLayerIds ?? [layer.id],
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
    onRotate180: jest.fn(),
    onMergeDown: jest.fn(),
    onFlattenVisible: jest.fn(),
    onTrimLayerToBounds: jest.fn(),
    onCropCanvasToActiveLayerVisiblePixels: jest.fn(),
    onCropCanvasToActiveLayerExtents: jest.fn(),
    onAddGroup: jest.fn(),
    onToggleGroupCollapsed: jest.fn(),
    onMoveLayerToGroup: jest.fn(),
    onUngroupLayer: jest.fn(),
    onGroupSelectedLayers: jest.fn(),
    onMergeSelectedLayers: jest.fn(),
    onDeleteSelectedLayers: jest.fn()
  };

  return { theme, layer, layers, props };
}

function renderPanel(options: {
  blendMode?: BlendMode;
  layerCount?: number;
  selectedLayerIds?: string[];
  activeLayerIndex?: number;
  visibleByIndex?: boolean[];
} = {}) {
  const { theme, layer, layers, props } = buildPanelProps(options);

  render(
    <ThemeProvider theme={theme}>
      <SketchLayersPanel {...props} />
    </ThemeProvider>
  );

  return { layer, layers, props };
}

describe("SketchLayersPanel imported layer source line", () => {
  it("names the image by its layer, not by its storage path", () => {
    const { theme, layer, props } = buildPanelProps();
    layer.name = "Variation 1";
    layer.imageReference = {
      uri: "/api/storage/1/188b129a59e34295b5f58b9f7dfca44c.png",
      naturalWidth: 1536,
      naturalHeight: 1024,
      objectFit: "contain"
    };
    const { container } = render(
      <ThemeProvider theme={theme}>
        <SketchLayersPanel {...props} />
      </ThemeProvider>
    );
    const line = container.querySelector(
      ".sketch-layers-panel__active-layer-ref"
    );
    expect(line).toHaveTextContent("Variation 1 · source 1536×1024 · contain");
    expect(line).not.toHaveTextContent("/api/storage");
    expect(line).not.toHaveTextContent(".png");
  });
});

describe("SketchLayersPanel From image layer", () => {
  it("defaults the output aspect to the source photo's ratio", () => {
    useSketchSessionStore.getState().reset();
    const { theme, layer, props } = buildPanelProps();
    layer.name = "holiday-photo.jpg";
    layer.imageReference = {
      uri: "/api/storage/1/holiday-photo.jpg",
      naturalWidth: 1200,
      naturalHeight: 800,
      objectFit: "contain"
    };
    render(
      <ThemeProvider theme={theme}>
        <SketchLayersPanel {...props} />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByTestId("layers-panel-add-image-to-image"));

    const binding = Object.values(useSketchSessionStore.getState().bindings)[0];
    expect(binding.kind).toBe("image-to-image");
    expect(binding.sourceLayerId).toBe(layer.id);
    expect(binding.aspectRatio).toBe("3:2");
    expect(binding.width! / binding.height!).toBeCloseTo(1.5, 2);
  });
});

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
    const { props } = renderPanel({ blendMode: "normal" });
    const combobox = screen.getByRole("combobox");

    fireEvent.keyDown(combobox, { key: "ArrowUp" });
    fireEvent.wheel(combobox, { deltaY: -100 });

    expect(props.onLayerBlendModeChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});

describe("SketchLayersPanel merge selected affordances", () => {
  it("invokes merge-selected from the layer context menu for valid multi-layer selections", async () => {
    const user = userEvent.setup();
    const { theme, layers, props } = buildPanelProps({ layerCount: 3 });
    const selectedIds = layers.map((layer) => layer.id);

    render(
      <ThemeProvider theme={theme}>
        <SketchLayersPanel
          {...props}
          activeLayerId={selectedIds[2]}
          selectedLayerIds={selectedIds}
        />
      </ThemeProvider>
    );

    // Merge actions now live in the layer right-click context menu (the bottom
    // toolbar was trimmed to a single-row essential set).
    fireEvent.contextMenu(screen.getByText("Layer 3"));
    await user.click(screen.getByRole("menuitem", { name: "Merge selected" }));

    expect(props.onMergeSelectedLayers).toHaveBeenCalledTimes(1);
  });

  it("offers Merge Selected in the layer context menu for selected multi-layer targets", () => {
    const { theme, layers, props } = buildPanelProps({ layerCount: 3 });
    const selectedIds = layers.map((layer) => layer.id);

    render(
      <ThemeProvider theme={theme}>
        <SketchLayersPanel
          {...props}
          activeLayerId={selectedIds[1]}
          selectedLayerIds={selectedIds}
        />
      </ThemeProvider>
    );

    fireEvent.contextMenu(screen.getByText("Layer 2"));

    expect(screen.getByRole("menuitem", { name: "Merge selected" })).toBeInTheDocument();
  });
});

describe("SketchLayersPanel visibility drag toggling", () => {
  it("toggles visibility across multiple layers while dragging over eye buttons", async () => {
    const user = userEvent.setup();
    const { layers, props } = renderPanel({ layerCount: 3 });

    await user.pointer([
      { target: screen.getByLabelText("Hide Layer 1"), keys: "[MouseLeft>]" },
      { target: screen.getByLabelText("Hide Layer 2") },
      { target: screen.getByLabelText("Hide Layer 3") },
      { keys: "[/MouseLeft]" }
    ]);

    expect(props.onToggleVisibility).toHaveBeenCalledTimes(3);
    expect(props.onToggleVisibility).toHaveBeenNthCalledWith(1, layers[0].id);
    expect(props.onToggleVisibility).toHaveBeenNthCalledWith(2, layers[1].id);
    expect(props.onToggleVisibility).toHaveBeenNthCalledWith(3, layers[2].id);
  });

  it("skips layers that already match the drag visibility target", async () => {
    const user = userEvent.setup();
    const { layers, props } = renderPanel({
      layerCount: 3,
      visibleByIndex: [true, false, true]
    });

    await user.pointer([
      { target: screen.getByLabelText("Hide Layer 1"), keys: "[MouseLeft>]" },
      { target: screen.getByLabelText("Show Layer 2") },
      { target: screen.getByLabelText("Hide Layer 3") },
      { keys: "[/MouseLeft]" }
    ]);

    expect(props.onToggleVisibility).toHaveBeenCalledTimes(2);
    expect(props.onToggleVisibility).toHaveBeenNthCalledWith(1, layers[0].id);
    expect(props.onToggleVisibility).toHaveBeenNthCalledWith(2, layers[2].id);
  });
});

describe("SketchLayersPanel add-layer actions", () => {
  it("adds a transparent layer from the New layer button", async () => {
    const user = userEvent.setup();
    const { props } = renderPanel();

    await user.click(screen.getByRole("button", { name: "New layer" }));

    expect(props.onAddLayer).toHaveBeenCalledWith(null);
  });

  it("offers filled layers and groups from the add menu", async () => {
    const user = userEvent.setup();
    const { props } = renderPanel();
    const menuButton = screen.getByRole("button", {
      name: "More ways to add a layer"
    });

    await user.click(menuButton);
    await user.click(screen.getByRole("menuitem", { name: "White layer" }));
    expect(props.onAddLayer).toHaveBeenCalledWith("#ffffff");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(menuButton);
    await user.click(screen.getByRole("menuitem", { name: "Layer group" }));
    expect(props.onAddGroup).toHaveBeenCalledTimes(1);
  });
});

describe("SketchLayersPanel layer context menu target", () => {
  it("makes a right-clicked layer active so menu actions apply to it", () => {
    const { layers, props } = renderPanel({ layerCount: 2, activeLayerIndex: 0 });

    fireEvent.contextMenu(screen.getByText("Layer 2"));

    expect(props.onSelectLayer).toHaveBeenCalledWith(layers[1].id);
  });

  it("keeps a multi-layer selection when right-clicking one of its layers", () => {
    const { theme, layers, props } = buildPanelProps({ layerCount: 3 });
    const selectedIds = layers.map((layer) => layer.id);

    render(
      <ThemeProvider theme={theme}>
        <SketchLayersPanel
          {...props}
          activeLayerId={selectedIds[0]}
          selectedLayerIds={selectedIds}
        />
      </ThemeProvider>
    );

    fireEvent.contextMenu(screen.getByText("Layer 2"));

    expect(props.onSelectLayer).not.toHaveBeenCalled();
  });
});

describe("SketchLayersPanel opacity slider", () => {
  it("marks keyboard steps as committed so each one is a single history entry", () => {
    const { layer, props } = renderPanel();
    const slider = screen.getByRole("slider");

    fireEvent.keyDown(slider, { key: "ArrowLeft" });

    expect(props.onLayerOpacityChange).toHaveBeenCalledWith(layer.id, 0.99, false);
    expect(props.onLayerOpacityChange).toHaveBeenLastCalledWith(layer.id, 0.99, true);
  });
});
