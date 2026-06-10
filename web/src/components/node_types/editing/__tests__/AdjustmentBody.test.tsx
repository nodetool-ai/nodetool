import React from "react";
import { render, screen } from "@testing-library/react";
import { AdjustmentBody } from "../AdjustmentBody";
import { ADJUSTMENT_NODE_TYPES } from "../AdjustmentBody.constants";
import { BESPOKE_BODY_REGISTRY } from "../bespokeRegistry";

// Resolve the node's settled output via useNodeOutput.
let mockNodeOutput: unknown = undefined;
jest.mock("../../../../hooks/nodes/useNodeIO", () => ({
  useNodeOutput: () => mockNodeOutput
}));

const mockSetProperty = jest.fn();
const mockSetPropertyComplete = jest.fn();
jest.mock("../../../../hooks/nodes/useLiveSliderWriter", () => ({
  useLiveSliderWriter: () => ({
    setProperty: mockSetProperty,
    setProperties: jest.fn(),
    setPropertyComplete: mockSetPropertyComplete
  })
}));

jest.mock("../../../node/HandleColumn", () => ({
  __esModule: true,
  default: ({ properties }: { properties: Array<{ name: string }> }) => (
    <div data-testid="handle-column" data-handles={properties.map((p) => p.name).join(",")} />
  )
}));

jest.mock("../../../node/ImageRefPreview", () => ({
  __esModule: true,
  default: ({ value }: { value: unknown }) => (
    <div data-testid="image-preview" data-has-value={value != null} />
  )
}));

jest.mock("../../../node/NodeOutputs", () => ({
  NodeOutputs: () => <div data-testid="node-outputs" />
}));

jest.mock("../../../node/NodeProgress", () => ({
  __esModule: true,
  default: () => <div data-testid="node-progress" />
}));

let sliderProps: Array<Record<string, unknown>> = [];
jest.mock("../../../ui_primitives", () => ({
  CheckerDropzone: ({ message }: { message: string }) => (
    <div data-testid="checker-dropzone">{message}</div>
  ),
  NodeSlider: (props: Record<string, unknown>) => {
    sliderProps.push(props);
    return (
      <div
        data-testid="node-slider"
        aria-label={props["aria-label"] as string}
        data-min={props.min as number}
        data-max={props.max as number}
        data-step={props.step as number}
        data-value={props.value as number}
        data-changed={String(props.changed)}
        data-track={String(props.track)}
      />
    );
  }
}));

jest.mock("@mui/material/styles", () => ({
  ...jest.requireActual("@mui/material/styles"),
  useTheme: () => ({
    spacing: (n: number) => `${n * 8}px`,
    vars: {
      palette: {
        primary: { main: "#6a8dff" },
        grey: { 900: "#111", 800: "#222", 700: "#333", 600: "#555", 500: "#888" },
        text: { secondary: "#999", primary: "#fff" }
      }
    },
    fontSizeSmaller: "0.75rem",
    fontFamily2: "monospace"
  })
}));

const brightnessContrastMeta = {
  node_type: "lib.image.color.BrightnessContrast",
  properties: [
    { name: "image", type: { type: "image" }, required: false },
    { name: "mask", type: { type: "image" }, required: false },
    {
      name: "brightness",
      type: { type: "float" },
      min: -1,
      max: 1,
      default: 0,
      required: false
    },
    {
      name: "contrast",
      type: { type: "float" },
      min: 0,
      max: 4,
      default: 1,
      required: false
    }
  ],
  outputs: [{ name: "output", type: { type: "image" } }]
};

const renderBody = (meta: unknown, properties: Record<string, unknown> = {}) =>
  render(
    <AdjustmentBody
      id="node-1"
      nodeType={(meta as { node_type: string }).node_type}
      nodeMetadata={meta as never}
      data={{ properties } as never}
      workflowId="wf-1"
      status="idle"
      isOutputNode={false}
    />
  );

describe("AdjustmentBody", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNodeOutput = undefined;
    sliderProps = [];
  });

  it("registers every ADJUSTMENT_NODE_TYPES entry to AdjustmentBody", () => {
    for (const nodeType of ADJUSTMENT_NODE_TYPES) {
      expect(BESPOKE_BODY_REGISTRY[nodeType]).toBe(AdjustmentBody);
    }
  });

  it("does not shadow nodes that have a dedicated bespoke body", () => {
    // The adjustment spread is last in the registry; a node listed here would
    // override its richer body. Guard the known dedicated image editors.
    const dedicated = [
      "lib.image.color_grading.Curves",
      "lib.image.color_grading.HSLAdjust",
      "nodetool.image.Levels",
      "nodetool.image.Crop",
      "nodetool.image.Fit",
      "nodetool.image.Paste",
      "nodetool.image.Resize",
      "nodetool.image.Scale",
      "nodetool.image.Channels"
    ];
    for (const nodeType of dedicated) {
      expect(ADJUSTMENT_NODE_TYPES).not.toContain(nodeType);
      expect(BESPOKE_BODY_REGISTRY[nodeType]).not.toBe(AdjustmentBody);
    }
  });

  it("derives one slider per numeric property, with metadata ranges", () => {
    renderBody(brightnessContrastMeta);

    const sliders = screen.getAllByTestId("node-slider");
    expect(sliders).toHaveLength(2); // brightness + contrast, not image/mask

    const brightness = sliders.find(
      (s) => s.getAttribute("aria-label") === "Brightness adjustment"
    )!;
    expect(brightness.getAttribute("data-min")).toBe("-1");
    expect(brightness.getAttribute("data-max")).toBe("1");
    expect(brightness.getAttribute("data-step")).toBe("0.01");

    const contrast = sliders.find(
      (s) => s.getAttribute("aria-label") === "Contrast adjustment"
    )!;
    expect(contrast.getAttribute("data-min")).toBe("0");
    expect(contrast.getAttribute("data-max")).toBe("4");
  });

  it("routes image and mask to the handle column, not sliders", () => {
    renderBody(brightnessContrastMeta);
    expect(screen.getByTestId("handle-column").getAttribute("data-handles")).toBe(
      "image,mask"
    );
  });

  it("falls back to the property default when no value is set", () => {
    renderBody(brightnessContrastMeta);
    const contrast = screen
      .getAllByTestId("node-slider")
      .find((s) => s.getAttribute("aria-label") === "Contrast adjustment")!;
    // contrast default is 1 — slider reflects it and is unchanged.
    expect(contrast.getAttribute("data-value")).toBe("1");
    expect(contrast.getAttribute("data-changed")).toBe("false");
  });

  it("marks a slider changed when its value differs from default", () => {
    renderBody(brightnessContrastMeta, { brightness: 0.5 });
    const brightness = screen
      .getAllByTestId("node-slider")
      .find((s) => s.getAttribute("aria-label") === "Brightness adjustment")!;
    expect(brightness.getAttribute("data-value")).toBe("0.5");
    expect(brightness.getAttribute("data-changed")).toBe("true");
  });

  it("fills bipolar sliders from the centre, unipolar from the left", () => {
    // brightness [-1,1] is bipolar (neutral at 0); contrast [0,4] is unipolar.
    const { container } = renderBody(brightnessContrastMeta, { brightness: 0.5 });

    const byLabel = (label: string) =>
      screen
        .getAllByTestId("node-slider")
        .find((s) => s.getAttribute("aria-label") === label)!;

    const brightness = byLabel("Brightness adjustment");
    expect(brightness.getAttribute("data-track")).toBe("false"); // native fill off
    const brightnessWrap = brightness.closest(".slider-wrap")!;
    expect(brightnessWrap.classList.contains("is-bipolar")).toBe(true);

    // value 0.5 in [-1,1] → centre at 50%, thumb at 75% → fill left 50% width 25%.
    const fill = brightnessWrap.querySelector(".bipolar-fill") as HTMLElement;
    expect(fill.style.left).toBe("50%");
    expect(fill.style.width).toBe("25%");
    expect(brightnessWrap.querySelector(".center-tick")).not.toBeNull();

    const contrast = byLabel("Contrast adjustment");
    expect(contrast.getAttribute("data-track")).toBe("normal");
    const contrastWrap = contrast.closest(".slider-wrap")!;
    expect(contrastWrap.classList.contains("is-bipolar")).toBe(false);
    expect(contrastWrap.querySelector(".bipolar-fill")).toBeNull();
    expect(container).toBeTruthy();
  });

  it("uses integer steps for int properties (Posterize levels)", () => {
    renderBody({
      node_type: "lib.image.color.Posterize",
      properties: [
        { name: "image", type: { type: "image" }, required: false },
        { name: "mask", type: { type: "image" }, required: false },
        {
          name: "levels",
          type: { type: "int" },
          min: 2,
          max: 32,
          default: 4,
          required: false
        }
      ],
      outputs: [{ name: "output", type: { type: "image" } }]
    });
    const levels = screen.getByTestId("node-slider");
    expect(levels.getAttribute("data-step")).toBe("1");
    expect(levels.getAttribute("data-value")).toBe("4");
  });
});
