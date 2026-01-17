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

  it("generates UUIDs that are strings", () => {
    const uuid = uuidv4();
    expect(typeof uuid).toBe("string");
  });

  it("generates UUIDs with lowercase hex characters", () => {
    const uuid = uuidv4();
    expect(uuid).toMatch(/^[0-9a-f-]+$/);
  });

  it("generates UUIDs with hyphen separators in correct positions", () => {
    const uuid = uuidv4();
    expect(uuid[8]).toBe("-");
    expect(uuid[13]).toBe("-");
    expect(uuid[18]).toBe("-");
    expect(uuid[23]).toBe("-");
  });

  it("consistently returns string type", () => {
    const uuid1 = uuidv4();
    const uuid2 = uuidv4();
    expect(typeof uuid1).toBe("string");
    expect(typeof uuid2).toBe("string");
    expect(uuid1.length).toBe(36);
    expect(uuid2.length).toBe(36);
  });
});
