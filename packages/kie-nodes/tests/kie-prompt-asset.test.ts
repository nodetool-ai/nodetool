import { describe, expect, it, vi, beforeEach } from "vitest";
import type { KieManifestEntry } from "../src/kie-factory.js";

vi.mock("../src/kie-base.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/kie-base.js")>();
  return {
    ...actual,
    getApiKey: () => "test-key",
    kieExecuteTask: vi.fn(),
    kieImageRef: vi.fn(async (b64: string) => ({ type: "image", data: b64 })),
    reportKieProviderCost: vi.fn(),
    uploadImageInput: vi.fn(async () => "https://cdn.example.com/img.png")
  };
});

const { createKieNodeClass } = await import("../src/kie-factory.js");
import { kieExecuteTask, uploadImageInput } from "../src/kie-base.js";

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
const b64 = Buffer.from(assetBytes).toString("base64");
const ctx = { resolveAssetBytes: async () => ({ bytes: assetBytes }) };

describe("KIE prompt asset mapping", () => {
  beforeEach(() => {
    vi.mocked(kieExecuteTask).mockReset();
    vi.mocked(kieExecuteTask).mockResolvedValue({
      data: "RESULT",
      items: ["RESULT"],
      taskId: "t",
      creditsConsumed: 0
    } as never);
    vi.mocked(uploadImageInput).mockClear();
  });

  it("routes an asset:// mention into the image upload and strips it", async () => {
    const NodeClass = makeEditNode();
    const node = new (NodeClass as new () => InstanceType<typeof NodeClass>)();
    node.assign({ prompt: "restyle asset://a.png now" });
    node.setDynamic("_secrets", { KIE_API_KEY: "test" });

    await node.process(ctx as never);

    // The mapped asset was resolved to bytes and handed to the uploader.
    const uploadedRef = vi.mocked(uploadImageInput).mock
      .calls[0][1] as Record<string, unknown>;
    expect(uploadedRef.data).toBe(b64);

    // The provider params carry the uploaded URL and a cleaned prompt.
    const params = vi.mocked(kieExecuteTask).mock.calls[0][2] as Record<
      string,
      unknown
    >;
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
    node.setDynamic("_secrets", { KIE_API_KEY: "test" });

    await node.process(ctx as never);

    const uploadedRef = vi.mocked(uploadImageInput).mock
      .calls[0][1] as Record<string, unknown>;
    expect(uploadedRef.uri).toBe("https://example.com/wired.png");
    expect(uploadedRef.data).toBeFalsy();

    const params = vi.mocked(kieExecuteTask).mock.calls[0][2] as Record<
      string,
      unknown
    >;
    expect(params.prompt).toBe("enhance now");
  });
});
