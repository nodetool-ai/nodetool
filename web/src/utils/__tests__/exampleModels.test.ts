import {
  EXAMPLE_MODEL_PACKS,
  exampleModelOverviewUri,
  fetchExampleModelCatalog,
  fetchExampleModelFile,
  type ExampleModel
} from "../exampleModels";

const originalFetch = global.fetch;
const mockFetch = jest.fn();

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
});
afterAll(() => {
  global.fetch = originalFetch;
});

describe("exampleModels", () => {
  it("builds the overview uri inside the pack directory", () => {
    expect(exampleModelOverviewUri("dungeon")).toBe(
      "package://nodetool-base/game-models/dungeon/overview.png"
    );
    expect(EXAMPLE_MODEL_PACKS.map((p) => p.slug)).toContain("dungeon");
  });

  it("fetches and returns a pack catalog", async () => {
    const catalog = { name: "Dungeon", models: [] };
    mockFetch.mockResolvedValue({ ok: true, json: async () => catalog });
    await expect(fetchExampleModelCatalog("dungeon")).resolves.toEqual(catalog);
    expect(mockFetch.mock.calls[0][0]).toContain(
      "game-models/dungeon/catalog.json"
    );
  });

  it("rejects when the catalog request fails", async () => {
    mockFetch.mockResolvedValue({ ok: false });
    await expect(fetchExampleModelCatalog("x")).rejects.toThrow(
      "Could not load the example models."
    );
  });

  const model: ExampleModel = {
    slug: "door",
    name: "Door",
    file: "door.glb",
    uri: "package://nodetool-base/game-models/dungeon/door.glb",
    triangles: 10,
    clips: [],
    use: "prop"
  };

  it("downloads a model as a named glb file", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["glb"])
    });
    const file = await fetchExampleModelFile(model);
    expect(file.name).toBe("door.glb");
    expect(file.type).toBe("model/gltf-binary");
    expect(mockFetch.mock.calls[0][0]).toContain("dungeon/door.glb");
  });

  it("rejects when the model request fails", async () => {
    mockFetch.mockResolvedValue({ ok: false });
    await expect(fetchExampleModelFile(model)).rejects.toThrow(
      "Could not load the example model."
    );
  });
});
