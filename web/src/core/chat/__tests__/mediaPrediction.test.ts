import {
  applyMediaPrediction,
  isMediaPredictionCapability,
  mediaPredictionLabel
} from "../mediaPrediction";

describe("mediaPrediction", () => {
  it("accepts generation capabilities and rejects judge/chat calls", () => {
    expect(isMediaPredictionCapability("text_to_image")).toBe(true);
    expect(isMediaPredictionCapability("text_to_video")).toBe(true);
    expect(isMediaPredictionCapability("text_to_speech")).toBe(true);
    expect(isMediaPredictionCapability("generate_messages")).toBe(false);
    expect(isMediaPredictionCapability("generate_embedding")).toBe(false);
    expect(isMediaPredictionCapability(undefined)).toBe(false);
  });

  it("labels image, video, and audio separately", () => {
    expect(mediaPredictionLabel("text_to_image")).toBe("Generating image");
    expect(mediaPredictionLabel("image_to_video")).toBe("Generating video");
    expect(mediaPredictionLabel("text_to_speech")).toBe("Generating audio");
  });

  it("appends a running media prediction and removes it on complete", () => {
    const running = applyMediaPrediction([], {
      id: "p1",
      status: "running",
      provider: "fal_ai",
      model: "flux-schnell",
      capability: "text_to_image"
    }, 1000);
    expect(running).toEqual([
      {
        id: "p1",
        provider: "fal_ai",
        model: "flux-schnell",
        capability: "text_to_image",
        startedAt: 1000
      }
    ]);
    expect(
      applyMediaPrediction(running ?? [], {
        id: "p1",
        status: "completed",
        capability: "text_to_image"
      })
    ).toEqual([]);
  });

  it("ignores a running generate_messages prediction", () => {
    expect(
      applyMediaPrediction([], {
        id: "p2",
        status: "running",
        provider: "openai",
        model: "gpt-5.4",
        capability: "generate_messages"
      })
    ).toBeNull();
  });

  it("keeps two in-flight calls", () => {
    const first = applyMediaPrediction([], {
      id: "a",
      status: "running",
      provider: "fal_ai",
      model: "flux",
      capability: "text_to_image"
    }, 1);
    const both = applyMediaPrediction(first ?? [], {
      id: "b",
      status: "running",
      provider: "fal_ai",
      model: "kling",
      capability: "text_to_video"
    }, 2);
    expect(both).toHaveLength(2);
    expect(both?.map((p) => p.id)).toEqual(["a", "b"]);
  });
});
