import { uuidv4 } from "../uuidv4";

describe("uuidv4", () => {
  it("generates a valid UUID v4 format", () => {
    const uuid = uuidv4();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(uuid).toMatch(uuidRegex);
  });

  it("generates UUID with version 4 marker", () => {
    const uuid = uuidv4();
    expect(uuid.charAt(14)).toBe("4");
  });

  it("generates UUID with correct variant", () => {
    const uuid = uuidv4();
    const variantChar = uuid.charAt(19);
    expect(["8", "9", "a", "b"]).toContain(variantChar);
  });

  it("generates unique UUIDs", () => {
    const uuid1 = uuidv4();
    const uuid2 = uuidv4();
    expect(uuid1).not.toBe(uuid2);
  });

  it("generates UUIDs with correct length", () => {
    const uuid = uuidv4();
    expect(uuid.length).toBe(36);
  });

  it("generates UUIDs containing dashes at correct positions", () => {
    const uuid = uuidv4();
    expect(uuid.charAt(8)).toBe("-");
    expect(uuid.charAt(13)).toBe("-");
    expect(uuid.charAt(18)).toBe("-");
    expect(uuid.charAt(23)).toBe("-");
  });
});
