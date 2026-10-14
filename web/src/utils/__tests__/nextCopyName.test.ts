import { nextCopyName } from "../nextCopyName";

describe("nextCopyName", () => {
  it("starts at (1) when no copies exist", () => {
    expect(nextCopyName("Flow", ["Flow"])).toBe("Flow (1)");
  });

  it("goes one past the highest existing number", () => {
    expect(nextCopyName("Flow", ["Flow", "Flow (1)", "Flow (4)"])).toBe(
      "Flow (5)"
    );
  });

  it("strips a copy suffix from the source name", () => {
    expect(nextCopyName("Flow (2)", ["Flow", "Flow (2)"])).toBe("Flow (3)");
  });

  it("ignores names of other bases and non-numeric suffixes", () => {
    expect(nextCopyName("Flow", ["Other (9)", "Flow (x)", "Flow 2"])).toBe(
      "Flow (1)"
    );
  });

  it("treats regex characters in the name literally", () => {
    expect(nextCopyName("a.b", ["a.b (1)", "axb (7)"])).toBe("a.b (2)");
  });

  it("truncates to 50 characters", () => {
    expect(nextCopyName("x".repeat(60), [])).toHaveLength(50);
  });
});
