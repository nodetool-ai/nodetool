import { formatFloat } from "../NumberInput.utils";

describe("formatFloat", () => {
  it("formats an integer with default minDecimalPlaces", () => {
    expect(formatFloat(42)).toBe("42.0");
  });

  it("formats an integer with minDecimalPlaces=2", () => {
    expect(formatFloat(42, 2)).toBe("42.00");
  });

  it("formats an integer with minDecimalPlaces=0", () => {
    expect(formatFloat(42, 0)).toBe("42");
  });

  it("extends decimals when fewer than minDecimalPlaces", () => {
    expect(formatFloat(1.5, 3)).toBe("1.500");
  });

  it("preserves decimals when more than minDecimalPlaces", () => {
    expect(formatFloat(3.14159, 1)).toBe("3.14159");
  });

  it("keeps decimals unchanged when exactly matching minDecimalPlaces", () => {
    expect(formatFloat(2.5, 1)).toBe("2.5");
  });

  it("formats zero with default minDecimalPlaces", () => {
    expect(formatFloat(0)).toBe("0.0");
  });

  it("formats a negative integer with default minDecimalPlaces", () => {
    expect(formatFloat(-5)).toBe("-5.0");
  });

  it("formats a negative float", () => {
    expect(formatFloat(-3.14)).toBe("-3.14");
  });

  it("preserves very small float decimals", () => {
    expect(formatFloat(0.001, 1)).toBe("0.001");
  });

  it("formats a large number with default minDecimalPlaces", () => {
    expect(formatFloat(1000000, 1)).toBe("1000000.0");
  });
});
