import { nextCopyName } from "../nextCopyName";

describe("nextCopyName", () => {
  it("numbers the first copy 1", () => {
    expect(nextCopyName("Greeting Demo", ["Greeting Demo"])).toBe(
      "Greeting Demo (1)"
    );
  });

  it("goes one past the highest existing copy of the same base", () => {
    expect(
      nextCopyName("Greeting Demo (1)", [
        "Greeting Demo",
        "Greeting Demo (1)",
        "Greeting Demo (3)",
        "Other (9)"
      ])
    ).toBe("Greeting Demo (4)");
  });

  it("treats regular expression characters in the name literally", () => {
    expect(nextCopyName("a.b", ["axb (5)"])).toBe("a.b (1)");
  });

  it("keeps the name within 50 characters", () => {
    expect(nextCopyName("x".repeat(60), [])).toHaveLength(50);
  });
});
