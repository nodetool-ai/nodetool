import { uuidv4 } from "../uuidv4";

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

  it("generates UUIDs with correct version and variant bits", () => {
    const uuid = uuidv4();
    const parts = uuid.split("-");
    expect(parts[0]).toHaveLength(8);
    expect(parts[1]).toHaveLength(4);
    expect(parts[2]).toHaveLength(4);
    expect(parts[2][0]).toBe("4");
    expect(parts[3]).toHaveLength(4);
    expect(["8", "9", "a", "b"]).toContain(parts[3][0]);
    expect(parts[4]).toHaveLength(12);
  });

});
