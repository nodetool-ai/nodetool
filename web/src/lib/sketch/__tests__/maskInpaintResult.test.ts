/**
 * @jest-environment jsdom
 */
import { describe, expect, it } from "@jest/globals";
import { maskInpaintResult } from "../maskInpaintResult";

describe("maskInpaintResult", () => {
  describe("input validation", () => {
    it("throws when width is zero", async () => {
      await expect(
        maskInpaintResult("data:image/png;base64,x", "data:image/png;base64,y", 0, 100)
      ).rejects.toThrow("Invalid canvas dimensions");
    });

    it("throws when height is zero", async () => {
      await expect(
        maskInpaintResult("data:image/png;base64,x", "data:image/png;base64,y", 100, 0)
      ).rejects.toThrow("Invalid canvas dimensions");
    });

    it("throws when width is negative", async () => {
      await expect(
        maskInpaintResult("data:image/png;base64,x", "data:image/png;base64,y", -1, 100)
      ).rejects.toThrow("Invalid canvas dimensions");
    });

    it("throws when height is negative", async () => {
      await expect(
        maskInpaintResult("data:image/png;base64,x", "data:image/png;base64,y", 100, -5)
      ).rejects.toThrow("Invalid canvas dimensions");
    });

    it("throws when both dimensions are zero", async () => {
      await expect(
        maskInpaintResult("data:image/png;base64,x", "data:image/png;base64,y", 0, 0)
      ).rejects.toThrow("Invalid canvas dimensions");
    });
  });

  describe("image loading errors", () => {
    it("rejects when generated image URL is invalid", async () => {
      await expect(
        maskInpaintResult("invalid-url", "data:image/png;base64,y", 100, 100)
      ).rejects.toThrow("Failed to load image");
    });

    it("rejects when mask URL is invalid", async () => {
      await expect(
        maskInpaintResult("data:image/png;base64,x", "invalid-url", 100, 100)
      ).rejects.toThrow("Failed to load image");
    });
  });
});
