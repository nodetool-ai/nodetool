/**
 * Segmentation runs whichever model the user picked: the provider call it
 * makes, and the credential it asks for.
 */

jest.mock("../resizeForInference", () => ({
  MAX_INFERENCE_DIMENSION: 2048,
  resizeForInference: async (dataUrl: string) => ({ dataUrl, scale: 1 })
}));

jest.mock("../../../../utils/resolveMediaUri", () => ({
  resolveMediaUri: async (uri: string | undefined | null) => uri ?? ""
}));

interface SegmentCall {
  image: string;
  imageMimeType: string;
  provider: string;
  model: string;
  prompt: string | null;
  points: unknown;
  box: unknown;
  maxMasks: number | null;
  minConfidence: number | null;
}

const segment = jest.fn(async (_input: SegmentCall) => ({
  provider: "fal_ai",
  model: "fal-ai/sam-3-1/image",
  masks: []
}));
jest.mock("../../../../trpc/client", () => ({
  trpcClient: {
    segmentation: {
      segment: {
        mutate: (input: SegmentCall) => segment(input)
      }
    }
  }
}));

/** The request the last run sent. */
function sentRequest(): SegmentCall {
  const call = segment.mock.calls[0];
  if (!call) {
    throw new Error("no segmentation was requested");
  }
  return call[0];
}

import { SegmentationService } from "../SegmentationService";
import useSecretsStore from "../../../../stores/SecretsStore";
import { DEFAULT_SEGMENT_SETTINGS } from "../../types";
import type { SegmentationRequest } from "../SamService";

const IMAGE_DATA_URL = "data:image/png;base64,aGVsbG8=";

function configureSecrets(keys: string[]): void {
  const secrets = keys.map((key) => ({ key, is_configured: true }));
  // The stub stands in for the list fetch: a key absent from it is absent from
  // the install, so availability never depends on reaching the server.
  useSecretsStore.setState({
    secrets: secrets as never,
    fetchSecrets: (async () => secrets) as never
  });
}

function request(
  overrides: Partial<SegmentationRequest["settings"]> = {}
): SegmentationRequest {
  return {
    imageDataUrl: IMAGE_DATA_URL,
    pointPrompts: [],
    boxPrompt: null,
    settings: { ...DEFAULT_SEGMENT_SETTINGS, ...overrides }
  };
}

describe("SegmentationService", () => {
  beforeEach(() => {
    segment.mockClear();
    configureSecrets(["FAL_API_KEY", "REPLICATE_API_TOKEN"]);
  });

  it("calls the picked model's provider rather than the default", async () => {
    const service = new SegmentationService();
    await service.runSegmentation(
      request({
        model: {
          provider: "replicate",
          id: "meta/sam-2",
          name: "SAM 2"
        }
      })
    );

    expect(sentRequest()).toMatchObject({
      provider: "replicate",
      model: "meta/sam-2"
    });
  });

  it("sends the image bytes without the data-URL prefix", async () => {
    const service = new SegmentationService();
    await service.runSegmentation(request());

    expect(sentRequest().image).toBe("aGVsbG8=");
    expect(sentRequest().imageMimeType).toBe("image/png");
  });

  it("falls back to the shipped default when nothing is picked", async () => {
    const service = new SegmentationService();
    await service.runSegmentation(request({ model: null }));

    expect(sentRequest()).toMatchObject({
      provider: "fal_ai",
      model: "fal-ai/sam-3-1/image"
    });
  });

  it("forwards the concept prompt and the object bounds", async () => {
    const service = new SegmentationService();
    await service.runSegmentation(
      request({ conceptPrompt: "  blood  ", maxObjects: 4, confidenceThreshold: 0.3 })
    );

    expect(sentRequest()).toMatchObject({
      prompt: "blood",
      maxMasks: 4,
      minConfidence: 0.3
    });
  });

  it("sends no prompt when the concept box is empty", async () => {
    const service = new SegmentationService();
    await service.runSegmentation(request({ conceptPrompt: "   " }));

    expect(sentRequest().prompt).toBeNull();
  });

  it("reports the picked model as available when its provider key is set", async () => {
    const service = new SegmentationService();
    const info = await service.checkModelAvailability({
      provider: "replicate",
      id: "meta/sam-2",
      name: "SAM 2"
    });

    expect(info.status).toBe("available");
    expect(info.modelId).toBe("meta/sam-2");
    expect(info.modelName).toBe("SAM 2");
  });

  it("asks for the picked model's own credential", async () => {
    configureSecrets(["FAL_API_KEY"]);
    const service = new SegmentationService();
    const info = await service.checkModelAvailability({
      provider: "replicate",
      id: "meta/sam-2",
      name: "SAM 2"
    });

    expect(info.status).toBe("not-installed");
    expect(info.errorMessage).toContain("REPLICATE_API_TOKEN");
  });

  it("reports the default model as unavailable with no fal key", async () => {
    configureSecrets(["REPLICATE_API_TOKEN"]);
    const service = new SegmentationService();
    const info = await service.checkModelAvailability(null);

    expect(info.status).toBe("not-installed");
    expect(info.errorMessage).toContain("FAL_API_KEY");
  });

  it("lets the call's own error reach the editor", async () => {
    segment.mockRejectedValueOnce(
      new Error(
        "Unauthorized — fal_ai/fal-ai/sam-3-1/image rejected the credentials (401)."
      )
    );

    const service = new SegmentationService();

    await expect(service.runSegmentation(request())).rejects.toThrow(
      /rejected the credentials \(401\)/
    );
  });

  it("turns the provider's masks into masks the editor can draw", async () => {
    // What `BaseProvider.segmentImage` returns over the wire: base64 mask
    // images, each carrying its own label and score.
    segment.mockResolvedValueOnce({
      provider: "fal_ai",
      model: "fal-ai/sam-3-1/image",
      masks: [
        {
          data: "aGVsbG8=",
          mimeType: "image/png",
          width: 256,
          height: 256,
          label: "hand",
          confidence: 0.87,
          box: null
        },
        {
          data: "d29ybGQ=",
          mimeType: "image/png",
          width: 256,
          height: 256,
          label: "sleeve",
          confidence: 0.42,
          box: null
        }
      ]
    } as never);

    const service = new SegmentationService();
    const response = await service.runSegmentation(request());

    expect(response.masks).toHaveLength(2);
    expect(response.masks[0].maskDataUrl).toBe(
      "data:image/png;base64,aGVsbG8="
    );
    expect(response.masks.map((m) => m.label)).toEqual(["hand", "sleeve"]);
    expect(response.masks.map((m) => m.confidence)).toEqual([0.87, 0.42]);
    expect(response.masks[0].bounds).toEqual({
      x: 0,
      y: 0,
      width: 256,
      height: 256
    });
  });
});
