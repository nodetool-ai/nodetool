/**
 * The document a Sketch Pad starts from: its layer stack, its ink, the sides it
 * accepts, and which stored values it will redraw from.
 */
import {
  createSketchPadDocument,
  padInkColor,
  sketchPadImageUri,
  sketchPadValue,
  DRAWING_LAYER_NAME,
  PAPER_LAYER_NAME
} from "../sketchPadDocument";
import {
  clampPadSide,
  DEFAULT_PAD_HEIGHT,
  DEFAULT_PAD_WIDTH
} from "../sketchPadOptions";

const pad = (overrides: Partial<Parameters<typeof createSketchPadDocument>[0]> = {}) =>
  createSketchPadDocument({
    width: 320,
    height: 240,
    background: "white",
    ...overrides
  });

/**
 * jsdom has no 2D context, so the paper fill is exercised against a stub that
 * records what was painted — otherwise every assertion about paper passes on a
 * layer that is silently empty.
 */
const withStubbedCanvas = <T,>(run: () => T): { result: T; fills: string[] } => {
  const fills: string[] = [];
  const getContext = HTMLCanvasElement.prototype.getContext;
  const toDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
    set fillStyle(color: string) {
      fills.push(color);
    },
    fillRect: jest.fn()
  })) as unknown as typeof getContext;
  HTMLCanvasElement.prototype.toDataURL = jest.fn(
    () => "data:image/png;base64,PAPER"
  ) as unknown as typeof toDataURL;
  try {
    return { result: run(), fills };
  } finally {
    HTMLCanvasElement.prototype.getContext = getContext;
    HTMLCanvasElement.prototype.toDataURL = toDataURL;
  }
};

describe("createSketchPadDocument", () => {
  it("puts a paper layer under the drawing layer", () => {
    // Erasing has to reveal paper, not the transparency checkerboard, and the
    // flattened PNG a workflow reads has to be opaque.
    const document = pad();

    expect(document.layers.map((layer) => layer.name)).toEqual([
      PAPER_LAYER_NAME,
      DRAWING_LAYER_NAME
    ]);
    expect(document.layers[0].locked).toBe(true);
    expect(document.activeLayerId).toBe(document.layers[1].id);
  });

  it("fills the paper layer white", () => {
    const { result, fills } = withStubbedCanvas(() => pad());

    expect(fills).toEqual(["#ffffff"]);
    expect(result.layers[0].data).toBe("data:image/png;base64,PAPER");
    expect(result.layers[1].data).toBeNull();
  });

  it("leaves the pad drawable where no canvas encoder exists", () => {
    // A headless renderer with no 2D context must still get a usable document
    // rather than a thrown error.
    expect(() => pad()).not.toThrow();
    expect(pad().layers).toHaveLength(2);
  });

  it("drops the paper layer when the pad is transparent", () => {
    const document = pad({ background: "transparent" });

    expect(document.layers.map((layer) => layer.name)).toEqual([
      DRAWING_LAYER_NAME
    ]);
    expect(document.activeLayerId).toBe(document.layers[0].id);
  });

  it("inks each painting tool to suit the background", () => {
    // The editor's default brush is white, which on paper draws nothing.
    const paper = pad();
    expect(paper.toolSettings.brush.color).toBe(padInkColor("white"));
    expect(paper.toolSettings.pencil.color).toBe(padInkColor("white"));
    expect(paper.toolSettings.fill.color).toBe(padInkColor("white"));

    const transparent = pad({ background: "transparent" });
    expect(transparent.toolSettings.brush.color).toBe(
      padInkColor("transparent")
    );
    expect(padInkColor("white")).not.toBe(padInkColor("transparent"));
  });

  it("redraws a previous drawing onto the drawing layer", () => {
    const document = pad({ image: "data:image/png;base64,AAA" });

    expect(document.layers[1].data).toBe("data:image/png;base64,AAA");
    expect(document.layers[0].data).not.toBe("data:image/png;base64,AAA");
  });

  it("sizes the canvas to what was asked", () => {
    const document = pad({ width: 800, height: 600 });
    expect(document.canvas.width).toBe(800);
    expect(document.canvas.height).toBe(600);
  });
});

describe("clampPadSide", () => {
  it("falls back when the author left the field empty", () => {
    expect(clampPadSide(undefined, DEFAULT_PAD_WIDTH)).toBe(DEFAULT_PAD_WIDTH);
    expect(clampPadSide(Number.NaN, DEFAULT_PAD_HEIGHT)).toBe(
      DEFAULT_PAD_HEIGHT
    );
  });

  it("keeps the canvas inside what a browser draws well", () => {
    expect(clampPadSide(4, 512)).toBe(64);
    expect(clampPadSide(99999, 512)).toBe(2048);
    expect(clampPadSide(300.4, 512)).toBe(300);
  });
});

describe("sketchPadValue / sketchPadImageUri", () => {
  it("writes the shape an image input writes", () => {
    expect(sketchPadValue("data:image/png;base64,AAA")).toEqual({
      type: "image",
      uri: "data:image/png;base64,AAA"
    });
  });

  it("reads back an inline PNG, whether bare or wrapped in a ref", () => {
    expect(sketchPadImageUri("data:image/png;base64,AAA")).toBe(
      "data:image/png;base64,AAA"
    );
    expect(
      sketchPadImageUri({ type: "image", uri: "data:image/png;base64,BBB" })
    ).toBe("data:image/png;base64,BBB");
  });

  it("refuses a reference the canvas cannot draw from", () => {
    // Seeding from these would need a fetch the canvas has no same-origin path
    // for; a blank pad beats a tainted one.
    expect(sketchPadImageUri("asset://abc")).toBeNull();
    expect(sketchPadImageUri({ uri: "https://cdn.test/a.png" })).toBeNull();
    expect(sketchPadImageUri(undefined)).toBeNull();
    expect(sketchPadImageUri({ type: "image" })).toBeNull();
  });
});
