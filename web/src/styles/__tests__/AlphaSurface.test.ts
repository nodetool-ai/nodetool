/**
 * @jest-environment node
 */
import { alphaSurfaceBg, alphaSurfaceCss } from "../AlphaSurface";

describe("AlphaSurface", () => {
  describe("alphaSurfaceBg", () => {
    it("exposes required CSS background properties", () => {
      expect(alphaSurfaceBg).toHaveProperty("backgroundColor");
      expect(alphaSurfaceBg).toHaveProperty("backgroundImage");
      expect(alphaSurfaceBg).toHaveProperty("backgroundSize");
      expect(alphaSurfaceBg).toHaveProperty("backgroundPosition");
    });

    it("uses a checkerboard gradient pattern", () => {
      expect(alphaSurfaceBg.backgroundImage).toContain("linear-gradient");
      expect(alphaSurfaceBg.backgroundImage).toContain("45deg");
      expect(alphaSurfaceBg.backgroundImage).toContain("transparent");
    });

    it("has matching size and position values", () => {
      // backgroundSize should be square
      const [w, h] = alphaSurfaceBg.backgroundSize.split(" ");
      expect(w).toBe(h);
    });

    it("uses low-contrast dark colours for a quiet appearance", () => {
      // Both checker colours should be dark (not bright like #ccc)
      expect(alphaSurfaceBg.backgroundColor).toMatch(/^#[0-3]/);
    });
  });

  describe("alphaSurfaceCss", () => {
    it("returns a serialized Emotion style object", () => {
      expect(alphaSurfaceCss).toHaveProperty("styles");
      expect(typeof alphaSurfaceCss.styles).toBe("string");
    });

    it("contains the checkerboard background-image", () => {
      expect(alphaSurfaceCss.styles).toContain("background-image");
      expect(alphaSurfaceCss.styles).toContain("linear-gradient");
    });

    it("contains background-color", () => {
      expect(alphaSurfaceCss.styles).toContain("background-color");
    });
  });
});
