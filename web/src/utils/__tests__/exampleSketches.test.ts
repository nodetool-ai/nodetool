import {
  buildExampleSketch,
  EXAMPLE_SKETCHES,
  EXAMPLE_SKETCH_HEIGHT,
  EXAMPLE_SKETCH_WIDTH,
  exampleSketchUrl,
  type ExampleSketch
} from "../exampleSketches";

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';

const example: ExampleSketch = {
  category: "Art studies",
  slug: "demo",
  name: "Demo",
  description: "demo",
  layers: [
    ["one", "Layer one"],
    ["two", "Layer two"]
  ]
};

describe("EXAMPLE_SKETCHES", () => {
  it("has unique slugs and non-empty layers", () => {
    const slugs = EXAMPLE_SKETCHES.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const sketch of EXAMPLE_SKETCHES) {
      expect(sketch.layers.length).toBeGreaterThan(0);
    }
  });
});

describe("exampleSketchUrl", () => {
  it("points at the bundled svg", () => {
    expect(exampleSketchUrl("demo", "one")).toBe(
      "/examples/sketches/demo/one.svg"
    );
  });
});

describe("buildExampleSketch", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("fetches every layer and activates the last one", async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      text: async () => SVG
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { sketch } = (await buildExampleSketch(example)) as unknown as {
      sketch: {
        layers: { id: string; name: string }[];
        activeLayerId: string;
        canvas: { width: number; height: number };
        historyIndex: number;
      };
    };

    expect(fetchMock.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      "/examples/sketches/demo/one.svg",
      "/examples/sketches/demo/two.svg"
    ]);
    expect(sketch.layers.map((l) => l.name)).toEqual([
      "Layer one",
      "Layer two"
    ]);
    expect(sketch.activeLayerId).toBe(sketch.layers[1].id);
    expect(sketch.canvas.width).toBe(EXAMPLE_SKETCH_WIDTH);
    expect(sketch.canvas.height).toBe(EXAMPLE_SKETCH_HEIGHT);
    expect(sketch.historyIndex).toBe(-1);
  });

  it("rejects when an artwork file cannot be loaded", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      text: async () => ""
    })) as unknown as typeof fetch;
    await expect(buildExampleSketch(example)).rejects.toThrow(
      "Could not load the example artwork."
    );
  });

  it("rejects an example with no layers", async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    await expect(
      buildExampleSketch({ ...example, layers: [] })
    ).rejects.toThrow("The example has no layers.");
  });
});
