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

  it("generates consistent format across multiple calls", () => {
    const id1 = uuidv4();
    const id2 = uuidv4();
    
    expect(id1.split("-").length).toBe(5);
    expect(id2.split("-").length).toBe(5);
    
    expect(id1.charAt(13)).toBe("4");
    expect(id2.charAt(13)).toBe("4");
    
    expect(["8", "9", "a", "b"]).toContain(id1.charAt(14));
    expect(["8", "9", "a", "b"]).toContain(id2.charAt(14));
  });

  it("version 4 UUID has correct version bit", () => {
    const id = uuidv4();
    const versionNibble = id.charAt(12);
    expect(versionNibble).toBe("4");
  });

  it("UUID variant bits are correct", () => {
    const id = uuidv4();
    const variantNibble = id.charAt(17);
    expect(["8", "9", "a", "b"]).toContain(variantNibble);
  });
});
