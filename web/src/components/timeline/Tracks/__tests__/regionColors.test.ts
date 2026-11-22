import { createTheme } from "@mui/material/styles";
import { mixHex, regionColors, trackRegionColor } from "../regionColors";

describe("regionColors", () => {
  it("mixes two hex colors", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("var(--x)", "#ffffff", 0.5)).toBe("var(--x)");
  });

  it("gives neighbouring tracks distinct colors", () => {
    const theme = createTheme();
    const colors = [0, 1, 2, 3, 4, 5].map((i) => trackRegionColor(theme, "dark", i));
    expect(new Set(colors).size).toBe(6);
    expect(trackRegionColor(theme, "dark", 6)).toBe(colors[0]);
  });

  it("draws content lighter than the body in dark mode and darker in light mode", () => {
    const common = { black: "#000000", white: "#ffffff" };
    const luma = (hex: string): number => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    const dark = regionColors("#50fa7b", "dark", "#101113", common);
    expect(luma(dark.content)).toBeGreaterThan(luma(dark.body) + 200);
    const light = regionColors("#16a34a", "light", "#ffffff", common);
    expect(luma(light.content)).toBeLessThan(luma(light.body) - 200);
  });
});
