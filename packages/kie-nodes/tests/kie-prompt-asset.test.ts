import { describe, expect, it } from "vitest";
import { createKieNodeClass } from "../src/kie-factory.js";
import type { KieManifestEntry } from "../src/kie-factory.js";
import { scriptedKie } from "./scripted-kie.js";

function makeEditNode() {
  const spec: KieManifestEntry = {
    className: "FluxKontextEdit",
    moduleName: "image",
    modelId: "flux-kontext",
    title: "Flux Kontext Edit",
    description: "test",
    outputType: "image",
    pollInterval: 1000,
    maxAttempts: 2,
    fields: [
      { name: "prompt", type: "str", default: "", required: true },
      {
        name: "image",
        type: "image",
        default: {
          type: "image",
          uri: "",
          asset_id: null,
          data: null,
          metadata: null
        }
      }
    ],
    uploads: [{ field: "image", kind: "image", paramName: "image_url" }]
  };
  return createKieNodeClass(spec);
}

const assetBytes = new Uint8Array([1, 2, 3, 4, 5]);

const UPLOAD_URLS: Record<string, string> = {
  image: "https://cdn.example.com/img.png",
  audio: "https://cdn.example.com/audio.wav",
  video: "https://cdn.example.com/clip.mp4"
};

/** A scripted KIE context whose asset store answers every asset:// mention. */
function assetContext() {
  const kie = scriptedKie({
    uploadUrl: (upload) => UPLOAD_URLS[upload.mimeType.split("/")[0]]
  });
  kie.context.resolveAssetBytes = async () => ({ bytes: assetBytes }) as never;
  return kie;
}

describe("KIE prompt asset mapping", () => {
  it("routes an asset:// mention into the image upload and strips it", async () => {
    const NodeClass = makeEditNode();
    const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    node.assign({ prompt: "restyle asset://a.png now" });
    const kie = assetContext();

    await node.process(kie.context);

    // The mapped asset was resolved to bytes and handed to the provider.
    expect(kie.provider.uploadCalls.map((call) => call.bytes)).toEqual([assetBytes]);

    // The endpoint input carries the uploaded URL and a cleaned prompt.
    const params = kie.provider.endpointCalls[0].input;
    expect(params.image_url).toBe("https://cdn.example.com/img.png");
    expect(params.prompt).toBe("restyle image_url now");
  });

  it("keeps a wired image upload but strips the mention", async () => {
    const NodeClass = makeEditNode();
    const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    node.assign({
      prompt: "enhance asset://a.png now",
      image: { type: "image", uri: "https://example.com/wired.png" }
    });
    const kie = assetContext();

    await node.process(kie.context);

    // A public URL reaches KIE as-is, with nothing uploaded.
    expect(kie.provider.uploadCalls).toEqual([]);
    const params = kie.provider.endpointCalls[0].input;
    expect(params.image_url).toBe("https://example.com/wired.png");
    expect(params.prompt).toBe("enhance now");
  });

  it("routes image, audio and video mentions onto their uploads", async () => {
    const spec: KieManifestEntry = {
      className: "Seedance2Reference",
      moduleName: "video",
      modelId: "bytedance-seedance-2",
      title: "Seedance 2.0 Reference to Video",
      description: "test",
      outputType: "video",
      pollInterval: 1000,
      maxAttempts: 2,
      fields: [
        { name: "prompt", type: "str", default: "", required: true },
        { name: "image", type: "image", default: null },
        { name: "audio", type: "audio", default: null },
        { name: "video", type: "video", default: null }
      ],
      uploads: [
        { field: "image", kind: "image", paramName: "image_url" },
        { field: "audio", kind: "audio", paramName: "audio_url" },
        { field: "video", kind: "video", paramName: "video_url" }
      ]
    };
    const NodeClass = createKieNodeClass(spec);
    const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    node.assign({
      prompt: "drive asset://clip.mp4 with asset://track.wav and asset://ref.png"
    });
    const kie = assetContext();

    await node.process(kie.context);

    // Each kind was resolved to bytes and uploaded under its own type.
    expect(
      kie.provider.uploadCalls.map((call) => [call.mimeType.split("/")[0], call.bytes])
    ).toEqual([
      ["image", assetBytes],
      ["audio", assetBytes],
      ["video", assetBytes]
    ]);

    const params = kie.provider.endpointCalls[0].input;
    expect(params.image_url).toBe("https://cdn.example.com/img.png");
    expect(params.audio_url).toBe("https://cdn.example.com/audio.wav");
    expect(params.video_url).toBe("https://cdn.example.com/clip.mp4");
    expect(params.prompt).toBe("drive video_url with audio_url and image_url");
  });
});
