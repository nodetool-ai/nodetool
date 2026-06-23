import { isDemoCast, CAST_VERSION, CAST_ASSET_SCHEME } from "../castTypes";

function makeValidCast(overrides: Record<string, unknown> = {}) {
  return {
    version: CAST_VERSION,
    id: "test-cast-1",
    name: "Test Cast",
    createdAt: "2024-01-01T00:00:00Z",
    durationMs: 5000,
    workflow: { id: "wf-1", nodes: [] },
    metadata: { "node.type": { type: "node.type" } },
    events: [],
    assets: [],
    ...overrides
  };
}

describe("CAST_VERSION", () => {
  it("equals 1", () => {
    expect(CAST_VERSION).toBe(1);
  });
});

describe("CAST_ASSET_SCHEME", () => {
  it("equals cast-asset://", () => {
    expect(CAST_ASSET_SCHEME).toBe("cast-asset://");
  });
});

describe("isDemoCast", () => {
  it("returns true for a valid cast object", () => {
    expect(isDemoCast(makeValidCast())).toBe(true);
  });

  it("returns true with optional fields present", () => {
    expect(
      isDemoCast(
        makeValidCast({
          description: "A demo",
          fps: 30,
          viewport: { x: 0, y: 0, zoom: 1 }
        })
      )
    ).toBe(true);
  });

  it("returns false for null", () => {
    expect(isDemoCast(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isDemoCast(undefined)).toBe(false);
  });

  it("returns false for non-object types", () => {
    expect(isDemoCast("string")).toBe(false);
    expect(isDemoCast(42)).toBe(false);
    expect(isDemoCast(true)).toBe(false);
  });

  it("returns false when version is wrong", () => {
    expect(isDemoCast(makeValidCast({ version: 2 }))).toBe(false);
    expect(isDemoCast(makeValidCast({ version: 0 }))).toBe(false);
    expect(isDemoCast(makeValidCast({ version: "1" }))).toBe(false);
  });

  it("returns false when version is missing", () => {
    const cast = makeValidCast();
    delete (cast as Record<string, unknown>).version;
    expect(isDemoCast(cast)).toBe(false);
  });

  it("returns false when id is not a string", () => {
    expect(isDemoCast(makeValidCast({ id: 42 }))).toBe(false);
    expect(isDemoCast(makeValidCast({ id: null }))).toBe(false);
  });

  it("returns false when id is missing", () => {
    const cast = makeValidCast();
    delete (cast as Record<string, unknown>).id;
    expect(isDemoCast(cast)).toBe(false);
  });

  it("returns false when workflow is null", () => {
    expect(isDemoCast(makeValidCast({ workflow: null }))).toBe(false);
  });

  it("returns false when workflow is not an object", () => {
    expect(isDemoCast(makeValidCast({ workflow: "not-object" }))).toBe(false);
    expect(isDemoCast(makeValidCast({ workflow: 42 }))).toBe(false);
  });

  it("returns false when events is not an array", () => {
    expect(isDemoCast(makeValidCast({ events: {} }))).toBe(false);
    expect(isDemoCast(makeValidCast({ events: "not-array" }))).toBe(false);
    expect(isDemoCast(makeValidCast({ events: null }))).toBe(false);
  });

  it("returns false when assets is not an array", () => {
    expect(isDemoCast(makeValidCast({ assets: {} }))).toBe(false);
    expect(isDemoCast(makeValidCast({ assets: null }))).toBe(false);
  });

  it("returns false when metadata is null", () => {
    expect(isDemoCast(makeValidCast({ metadata: null }))).toBe(false);
  });

  it("returns false when metadata is not an object", () => {
    expect(isDemoCast(makeValidCast({ metadata: "not-object" }))).toBe(false);
    expect(isDemoCast(makeValidCast({ metadata: 42 }))).toBe(false);
  });

  it("returns false for an empty object", () => {
    expect(isDemoCast({})).toBe(false);
  });

  it("accepts empty arrays for events and assets", () => {
    expect(isDemoCast(makeValidCast({ events: [], assets: [] }))).toBe(true);
  });

  it("accepts non-empty events and assets arrays", () => {
    expect(
      isDemoCast(
        makeValidCast({
          events: [{ t: 0, message: { type: "job_update" } }],
          assets: [{ key: "k", file: "k.png", contentType: "image/png" }]
        })
      )
    ).toBe(true);
  });
});
