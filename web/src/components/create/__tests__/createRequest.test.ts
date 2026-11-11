import useMediaGenerationStore from "../../../stores/MediaGenerationStore";
import type { CreateReference } from "../../../stores/CreateViewStore";
import {
  batchSeeds,
  buildCreateBatch,
  createBlocker,
  type CreateSettings
} from "../createRequest";

const imageModel = (id: string) => ({
  type: "image_model" as const,
  id,
  provider: "fake" as never,
  name: id,
  path: ""
});

const videoModel = (id: string) => ({
  type: "video_model" as const,
  id,
  provider: "fake",
  name: id
});

const settings = (overrides: Partial<CreateSettings> = {}): CreateSettings => {
  const defaults = useMediaGenerationStore.getState();
  return {
    image: {
      model: imageModel("flux"),
      resolution: "1K",
      aspectRatio: "16:9",
      variations: 4
    },
    imageEdit: { ...defaults.imageEdit, model: imageModel("kontext"), variations: 3 },
    video: {
      model: videoModel("wan"),
      resolution: "1080p",
      aspectRatio: "16:9",
      duration: 8
    },
    imageToVideo: { ...defaults.imageToVideo, model: videoModel("kling") },
    referenceToVideo: { ...defaults.referenceToVideo, model: videoModel("vidu") },
    retake: { model: videoModel("aleph") },
    extend: { ...defaults.extend, model: videoModel("veo"), direction: "end", duration: 4 },
    audio: { ...defaults.audio, model: { type: "tts_model", id: "tts", provider: "fake", name: "tts" } as never },
    music: { ...defaults.music, model: { type: "music_model", id: "song", provider: "fake", name: "song" } as never },
    presetIds: {},
    ...overrides
  };
};

const picture = (id: string): CreateReference => ({ assetId: id, contentType: "image/png", name: id });
const clip = (id: string): CreateReference => ({ assetId: id, contentType: "video/mp4", name: id });

describe("batchSeeds", () => {
  it("returns distinct seeds, including across the wrap point", () => {
    const seeds = batchSeeds(4, 2 ** 31 - 2);
    expect(new Set(seeds).size).toBe(4);
    expect(seeds.every((seed) => seed >= 0 && seed < 2 ** 31)).toBe(true);
  });
});

describe("buildCreateBatch", () => {
  it("makes one image request per take, each asking for one image with its own seed", () => {
    const requests = buildCreateBatch("image", settings(), "a lighthouse", 3);
    expect(requests).toHaveLength(3);
    expect(requests.map((request) => request.variations)).toEqual([1, 1, 1]);
    expect(new Set(requests.map((request) => request.seed)).size).toBe(3);
    expect(requests[0]).toMatchObject({
      mode: "image",
      provider: "fake",
      model: "flux",
      prompt: "a lighthouse",
      width: 1820,
      height: 1024
    });
  });

  it("carries the video settings and presets", () => {
    const [request] = buildCreateBatch(
      "video",
      settings({ presetIds: { video: ["camera.arc"] } }),
      "dolly in",
      1,
      [],
      [7]
    );
    expect(request).toMatchObject({
      mode: "video",
      model: "wan",
      duration: 8,
      aspect_ratio: "16:9",
      preset_ids: ["camera.arc"],
      seed: 7
    });
  });

  it("omits preset_ids and empty fields when none are set", () => {
    const [request] = buildCreateBatch("video", settings(), "x", 1);
    expect(request).not.toHaveProperty("preset_ids");
    expect(Object.values(request)).not.toContain(null);
  });

  it("edits the first picture and sends the rest as references", () => {
    const [request] = buildCreateBatch("image_edit", settings(), "night", 1, [
      picture("a"),
      clip("ignored"),
      picture("b")
    ]);
    expect(request).toMatchObject({
      mode: "image_edit",
      model: "kontext",
      variations: 1,
      source_asset_id: "a",
      reference_images: [{ type: "image", asset_id: "b" }]
    });
  });

  it("animates a picture as a video request with a source image", () => {
    const [request] = buildCreateBatch("image_to_video", settings(), "waves", 1, [picture("frame")]);
    expect(request).toMatchObject({ mode: "video", model: "kling", source_asset_id: "frame" });
    expect(request).not.toHaveProperty("capability");
  });

  it("sends reference pictures and clips under the reference capability", () => {
    const [request] = buildCreateBatch("reference_to_video", settings(), "walk", 1, [
      picture("face"),
      clip("motion")
    ]);
    expect(request).toMatchObject({
      mode: "video",
      capability: "reference_to_video",
      reference_images: [{ type: "image", asset_id: "face" }],
      reference_videos: [{ type: "video", asset_id: "motion" }]
    });
    expect(request).not.toHaveProperty("source_asset_id");
    // Off means unstated: a model that cannot keep reference audio rejects the field.
    expect(request).not.toHaveProperty("use_reference_video_audio");
  });

  it("changes a clip as video_edit with pictures guiding the look", () => {
    const [request] = buildCreateBatch("retake", settings(), "storm", 1, [
      picture("look"),
      clip("shot")
    ]);
    expect(request).toMatchObject({
      mode: "video_edit",
      model: "aleph",
      source_asset_id: "shot",
      reference_images: [{ type: "image", asset_id: "look" }]
    });
  });

  it("extends a clip in the chosen direction by the chosen seconds", () => {
    const [request] = buildCreateBatch("extend", settings(), "pull back", 1, [clip("shot")]);
    expect(request).toMatchObject({
      mode: "video_extend",
      model: "veo",
      source_asset_id: "shot",
      extension_mode: "end",
      duration: 4,
      variations: 1
    });
    expect(request).not.toHaveProperty("extend_direction");
  });

  it("sends speech and music with their own settings", () => {
    const [speech] = buildCreateBatch("audio", settings(), "Hello", 1);
    expect(speech).toMatchObject({ mode: "audio", model: "tts", voice: settings().audio.voice });
    const [music] = buildCreateBatch("music", settings(), "piano", 1);
    expect(music).toMatchObject({ mode: "music", model: "song", duration: settings().music.duration });
  });
});

describe("createBlocker", () => {
  it("names what is missing", () => {
    expect(createBlocker("image", settings(), "  ")).toBe("no-prompt");
    expect(
      createBlocker(
        "image",
        settings({ image: { ...settings().image, model: null } }),
        "go"
      )
    ).toBe("no-model");
    expect(createBlocker("video", settings(), "go")).toBeNull();
  });

  it("asks for the input a mode works from before the model", () => {
    const noModel = settings({ imageEdit: { ...settings().imageEdit, model: null } });
    expect(createBlocker("image_edit", noModel, "go")).toBe("no-image");
    expect(createBlocker("image_edit", noModel, "go", [picture("a")])).toBe("no-model");
    expect(createBlocker("image_to_video", settings(), "go", [clip("a")])).toBe("no-image");
    expect(createBlocker("retake", settings(), "go", [picture("a")])).toBe("no-video");
    expect(createBlocker("extend", settings(), "go", [clip("a")])).toBeNull();
    expect(createBlocker("reference_to_video", settings(), "go")).toBe("no-reference");
    expect(createBlocker("reference_to_video", settings(), "go", [clip("a")])).toBeNull();
  });
});
