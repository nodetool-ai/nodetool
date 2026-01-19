import { uuidv4 } from "../uuidv4";

describe("uuidv4", () => {
  it("generates a valid UUID v4 format", () => {
    const id = uuidv4();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("generates unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(uuidv4());
    }
    expect(ids.size).toBe(100);
  });

  it("generates UUID with version 4 indicator", () => {
    const id = uuidv4();
    const versionChar = id.charAt(14);
    expect(versionChar).toBe("4");
  });

  it("generates UUID with variant indicator", () => {
    const id = uuidv4();
    const variantChar = id.charAt(19);
    expect(["8", "9", "a", "b"]).toContain(variantChar);
  });

  it("generates UUID with correct hyphen positions", () => {
    const id = uuidv4();
    expect(id.charAt(8)).toBe("-");
    expect(id.charAt(13)).toBe("-");
    expect(id.charAt(18)).toBe("-");
    expect(id.charAt(23)).toBe("-");
  });

  it("generates 36 character UUID", () => {
    const id = uuidv4();
    expect(id.length).toBe(36);
  });

  it("always returns a string", () => {
    const id = uuidv4();
    expect(typeof id).toBe("string");
  });
});
