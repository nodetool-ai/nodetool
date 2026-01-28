import { v4 as uuidv4 } from "uuid";

describe("uuidv4", () => {
  it("generates a valid UUID v4 format", () => {
    const uuid = uuidv4();
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("generates unique UUIDs", () => {
    const uuid1 = uuidv4();
    const uuid2 = uuidv4();
    expect(uuid1).not.toBe(uuid2);
  });

  it("generates UUIDs with correct version and variant", () => {
    const uuid = uuidv4();
    const parts = uuid.split("-");
    
    expect(parts[0]).toHaveLength(8);
    expect(parts[1]).toHaveLength(4);
    expect(parts[2]).toHaveLength(4);
    expect(parts[3]).toHaveLength(4);
    expect(parts[4]).toHaveLength(12);
    
    expect(parts[2][0]).toBe("4");
    
    const variantCharacter = parts[3][0];
    expect(["8", "9", "a", "b"]).toContain(variantCharacter);
  });

  it("generates UUIDs that contain only hexadecimal characters", () => {
    const uuid = uuidv4();
    const hexPattern = /^[0-9a-f]+$/i;
    const cleanedUuid = uuid.replace(/-/g, "");
    
    expect(cleanedUuid).toMatch(hexPattern);
  });

  it("generates multiple UUIDs with no collisions", () => {
    const uuids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      uuids.add(uuidv4());
    }
    expect(uuids.size).toBe(100);
  });
});
