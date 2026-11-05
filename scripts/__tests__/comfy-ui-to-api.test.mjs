import { describe, expect, it } from "vitest";
import { uiToApi } from "../comfy-templates/ui-to-api.mjs";

const AUDIO_LATENT = {
  input: {
    required: {
      frames_number: ["INT", { default: 97 }],
      frame_rate: ["FLOAT,INT", { default: 25, widgetType: "FLOAT" }],
      batch_size: ["INT", { default: 1 }],
      audio_vae: ["VAE", {}]
    }
  },
  input_order: { required: ["frames_number", "frame_rate", "batch_size", "audio_vae"] }
};

describe("uiToApi", () => {
  it("keeps the place of a multi-type widget in widgets_values", () => {
    const prompt = uiToApi(
      { nodes: [{ id: 1, type: "AudioLatent", inputs: [], widgets_values: [121, 24, 1] }], links: [] },
      { AudioLatent: AUDIO_LATENT }
    );
    expect(prompt["1"].inputs).toMatchObject({ frames_number: 121, frame_rate: 24, batch_size: 1 });
  });

  it("does not treat a socket-only multi-type input as a widget", () => {
    const prompt = uiToApi(
      { nodes: [{ id: 1, type: "Either", inputs: [], widgets_values: [5] }], links: [] },
      {
        Either: {
          input: { required: { value: ["INT,FLOAT", {}], steps: ["INT", {}] } },
          input_order: { required: ["value", "steps"] }
        }
      }
    );
    expect(prompt["1"].inputs.steps).toBe(5);
  });
});
