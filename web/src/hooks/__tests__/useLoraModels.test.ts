import { describe, it, expect } from "@jest/globals";
import { isLoraType } from "../useLoraModels";

describe("isLoraType", () => {
  describe("SD LoRA types", () => {
    it("should return true for hf.lora_sd", () => {
      expect(isLoraType("hf.lora_sd")).toBe(true);
    });

    it("should return true for hf.lora_sdxl", () => {
      expect(isLoraType("hf.lora_sdxl")).toBe(true);
    });

    it("should return true for hf.lora_sd_config", () => {
      expect(isLoraType("hf.lora_sd_config")).toBe(true);
    });
  });

  describe("Flux LoRA types", () => {
    it("should return true for hf.lora_flux", () => {
      expect(isLoraType("hf.lora_flux")).toBe(true);
    });

    it("should return true for hf.lora_flux_config", () => {
      expect(isLoraType("hf.lora_flux_config")).toBe(true);
    });
  });

  describe("non-LoRA types", () => {
    it("should return false for hf.lora (without suffix)", () => {
      expect(isLoraType("hf.lora")).toBe(false);
    });

    it("should return false for hf.flux", () => {
      expect(isLoraType("hf.flux")).toBe(false);
    });

    it("should return false for hf.stable_diffusion", () => {
      expect(isLoraType("hf.stable_diffusion")).toBe(false);
    });

    it("should return false for hf.text_to_image", () => {
      expect(isLoraType("hf.text_to_image")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isLoraType("")).toBe(false);
    });
  });
});
