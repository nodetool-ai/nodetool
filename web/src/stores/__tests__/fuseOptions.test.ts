import { fuseOptions, ExtendedFuseOptions } from "../fuseOptions";

describe("fuseOptions", () => {
  it("has correct structure with required Fuse.js properties", () => {
    expect(fuseOptions.keys).toBeDefined();
    expect(fuseOptions.includeMatches).toBe(true);
    expect(fuseOptions.ignoreLocation).toBe(true);
    expect(fuseOptions.threshold).toBe(0.3);
    expect(fuseOptions.distance).toBe(2);
    expect(fuseOptions.includeScore).toBe(true);
    expect(fuseOptions.shouldSort).toBe(true);
    expect(fuseOptions.minMatchCharLength).toBe(3);
    expect(fuseOptions.useExtendedSearch).toBe(true);
  });

  it("has correct keys with weights", () => {
    expect(fuseOptions.keys).toHaveLength(4);
    expect(fuseOptions.keys).toEqual([
      { name: "title", weight: 0.8 },
      { name: "namespace", weight: 0.4 },
      { name: "tags", weight: 0.4 },
      { name: "description", weight: 0.3 }
    ]);
  });

  it("has tokenize options set correctly", () => {
    expect(fuseOptions.tokenize).toBe(false);
    expect(fuseOptions.matchAllTokens).toBe(false);
    expect(fuseOptions.findAllMatches).toBe(true);
  });

  it("has extended search options enabled", () => {
    expect(fuseOptions.useExtendedSearch).toBe(true);
    expect(fuseOptions.findAllMatches).toBe(true);
  });

  it("has correct search sensitivity settings", () => {
    expect(fuseOptions.threshold).toBeLessThan(0.5);
    expect(fuseOptions.threshold).toBeGreaterThan(0);
    expect(fuseOptions.distance).toBeGreaterThan(0);
  });

  it("is a valid ExtendedFuseOptions object", () => {
    const options: ExtendedFuseOptions<any> = fuseOptions;
    expect(options.keys).toBeInstanceOf(Array);
    expect(typeof options.threshold).toBe("number");
    expect(typeof options.distance).toBe("number");
    expect(typeof options.ignoreLocation).toBe("boolean");
    expect(typeof options.shouldSort).toBe("boolean");
  });

  it("has minimum match character length set", () => {
    expect(fuseOptions.minMatchCharLength).toBe(3);
  });

  it("includes matches and score", () => {
    expect(fuseOptions.includeMatches).toBe(true);
    expect(fuseOptions.includeScore).toBe(true);
  });
});
