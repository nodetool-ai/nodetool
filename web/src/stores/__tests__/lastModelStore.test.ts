import { describe, it, expect, beforeEach } from "@jest/globals";
import { act } from "@testing-library/react";
import {
  useLastModelStore,
  modelKindForBinding,
  getRememberedModel
} from "../lastModelStore";

describe("lastModelStore", () => {
  beforeEach(() => {
    act(() => {
      useLastModelStore.setState({ byKind: {} });
    });
  });

  describe("modelKindForBinding", () => {
    it("maps text-to-video to video", () => {
      expect(modelKindForBinding("text-to-video")).toBe("video");
    });

    it("maps text-to-audio to audio", () => {
      expect(modelKindForBinding("text-to-audio")).toBe("audio");
    });

    it("maps text-to-image to image", () => {
      expect(modelKindForBinding("text-to-image")).toBe("image");
    });

    it("maps image-to-image to image", () => {
      expect(modelKindForBinding("image-to-image")).toBe("image");
    });

    it("maps inpaint to image", () => {
      expect(modelKindForBinding("inpaint")).toBe("image");
    });

    it("returns null for unknown binding kinds", () => {
      expect(modelKindForBinding("workflow")).toBeNull();
      expect(modelKindForBinding("unknown")).toBeNull();
    });

    it("returns null for undefined", () => {
      expect(modelKindForBinding(undefined)).toBeNull();
    });
  });

  describe("remember", () => {
    it("stores a model for a kind", () => {
      act(() => {
        useLastModelStore.getState().remember("image", {
          provider: "fal",
          model: "flux"
        });
      });
      const stored = useLastModelStore.getState().byKind.image;
      expect(stored).toEqual({ provider: "fal", model: "flux", voice: undefined });
    });

    it("no-ops when provider is missing", () => {
      act(() => {
        useLastModelStore.getState().remember("image", { model: "flux" });
      });
      expect(useLastModelStore.getState().byKind.image).toBeUndefined();
    });

    it("no-ops when model is missing", () => {
      act(() => {
        useLastModelStore.getState().remember("image", { provider: "fal" });
      });
      expect(useLastModelStore.getState().byKind.image).toBeUndefined();
    });

    it("does not create a new object when the value is unchanged", () => {
      const value = { provider: "openai", model: "tts-1", voice: "alloy" };
      act(() => {
        useLastModelStore.getState().remember("audio", value);
      });
      const stateBefore = useLastModelStore.getState();
      act(() => {
        useLastModelStore.getState().remember("audio", value);
      });
      expect(useLastModelStore.getState()).toBe(stateBefore);
    });

    it("updates when the model changes", () => {
      act(() => {
        useLastModelStore.getState().remember("video", {
          provider: "fal",
          model: "v1"
        });
      });
      act(() => {
        useLastModelStore.getState().remember("video", {
          provider: "fal",
          model: "v2"
        });
      });
      expect(useLastModelStore.getState().byKind.video?.model).toBe("v2");
    });

    it("stores voice for audio kind", () => {
      act(() => {
        useLastModelStore.getState().remember("audio", {
          provider: "openai",
          model: "tts-1",
          voice: "nova"
        });
      });
      expect(useLastModelStore.getState().byKind.audio?.voice).toBe("nova");
    });
  });

  describe("getRememberedModel", () => {
    it("returns undefined when no model is remembered", () => {
      expect(getRememberedModel("image")).toBeUndefined();
    });

    it("returns the remembered model", () => {
      act(() => {
        useLastModelStore.getState().remember("image", {
          provider: "fal",
          model: "flux"
        });
      });
      expect(getRememberedModel("image")).toEqual({
        provider: "fal",
        model: "flux",
        voice: undefined
      });
    });
  });
});
