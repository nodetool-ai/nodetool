import { describe, it, expect, vi } from "vitest";
import { CohereProvider } from "../../src/providers/cohere-provider.js";
import { JinaProvider } from "../../src/providers/jina-provider.js";
import { VoyageProvider } from "../../src/providers/voyage-provider.js";
import { OpenAIProvider } from "../../src/providers/openai-provider.js";

const mockOk = (json: unknown) =>
  ({
    ok: true,
    status: 200,
    json: async () => json,
    text: async () => JSON.stringify(json)
  }) as unknown as Response;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const PNG_BASE64 = Buffer.from(PNG).toString("base64");

function sentBody(fetchFn: ReturnType<typeof vi.fn>): Record<string, unknown> {
  return JSON.parse((fetchFn.mock.calls[0]![1] as RequestInit).body as string);
}

describe("image embeddings", () => {
  it("Jina sends each image as a typed base64 input and orders vectors by index", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mockOk({ data: [{ embedding: [0, 1], index: 1 }, { embedding: [1, 0], index: 0 }] })
    );
    const p = new JinaProvider({ JINA_API_KEY: "k" }, { fetchFn: fetchFn as unknown as typeof fetch });
    const vectors = await p.generateImageEmbedding({
      images: [{ data: PNG, mimeType: "image/png" }, { data: PNG }],
      model: "jina-clip-v2"
    });
    expect(vectors).toEqual([
      [1, 0],
      [0, 1]
    ]);
    expect(fetchFn.mock.calls[0]![0]).toBe("https://api.jina.ai/v1/embeddings");
    expect(sentBody(fetchFn)).toEqual({
      model: "jina-clip-v2",
      input: [{ image: PNG_BASE64 }, { image: PNG_BASE64 }]
    });
  });

  it("Jina sends text for a CLIP model as typed inputs, so it lands in the image space", async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockOk({ data: [{ embedding: [1], index: 0 }] }));
    const p = new JinaProvider({ JINA_API_KEY: "k" }, { fetchFn: fetchFn as unknown as typeof fetch });
    await p.generateEmbedding({ text: "a red fox", model: "jina-clip-v2" });
    expect(sentBody(fetchFn).input).toEqual([{ text: "a red fox" }]);
  });

  it("Jina refuses a text-only model for images", async () => {
    const p = new JinaProvider({ JINA_API_KEY: "k" });
    await expect(
      p.generateImageEmbedding({ images: [{ data: PNG }], model: "jina-embeddings-v3" })
    ).rejects.toThrow(/does not embed images/);
  });

  it("Voyage posts images and multimodal text to /multimodalembeddings", async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockOk({ data: [{ embedding: [0.5], index: 0 }] }));
    const p = new VoyageProvider({ VOYAGE_API_KEY: "k" }, { fetchFn: fetchFn as unknown as typeof fetch });
    await p.generateImageEmbedding({
      images: [{ data: PNG, mimeType: "image/jpeg" }],
      model: "voyage-multimodal-3"
    });
    expect(fetchFn.mock.calls[0]![0]).toBe("https://api.voyageai.com/v1/multimodalembeddings");
    expect(sentBody(fetchFn)).toEqual({
      model: "voyage-multimodal-3",
      inputs: [{ content: [{ type: "image_base64", image_base64: `data:image/jpeg;base64,${PNG_BASE64}` }] }],
      input_type: "document"
    });

    fetchFn.mockClear();
    await p.generateEmbedding({ text: ["a red fox"], model: "voyage-multimodal-3" });
    expect(fetchFn.mock.calls[0]![0]).toBe("https://api.voyageai.com/v1/multimodalembeddings");
    expect(sentBody(fetchFn).inputs).toEqual([{ content: [{ type: "text", text: "a red fox" }] }]);
  });

  it("Cohere sends each image as its own input with an image_url data URI", async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockOk({ embeddings: { float: [[0.1], [0.2]] } }));
    const p = new CohereProvider({ COHERE_API_KEY: "k" }, { fetchFn: fetchFn as unknown as typeof fetch });
    const vectors = await p.generateImageEmbedding({
      images: [{ data: PNG }, { data: PNG, mimeType: "image/webp" }],
      model: "embed-v4.0"
    });
    expect(vectors).toEqual([[0.1], [0.2]]);
    expect(sentBody(fetchFn)).toEqual({
      model: "embed-v4.0",
      inputs: [
        { content: [{ type: "image_url", image_url: { url: `data:image/png;base64,${PNG_BASE64}` } }] },
        { content: [{ type: "image_url", image_url: { url: `data:image/webp;base64,${PNG_BASE64}` } }] }
      ],
      input_type: "search_document",
      embedding_types: ["float"]
    });
  });

  it("Cohere refuses a v3 model, whose image vectors do not share the text space", async () => {
    const p = new CohereProvider({ COHERE_API_KEY: "k" });
    await expect(
      p.generateImageEmbedding({ images: [{ data: PNG }], model: "embed-english-v3.0" })
    ).rejects.toThrow(/Use embed-v4.0/);
  });

  it("rejects an empty image", async () => {
    const p = new CohereProvider({ COHERE_API_KEY: "k" });
    await expect(
      p.generateImageEmbedding({ images: [{ data: new Uint8Array() }], model: "embed-v4.0" })
    ).rejects.toThrow(/images must not be empty/);
  });

  it("a provider without a multimodal model says so", async () => {
    const p = new OpenAIProvider({ OPENAI_API_KEY: "k" });
    await expect(
      p.generateImageEmbedding({ images: [{ data: PNG }], model: "text-embedding-3-small" })
    ).rejects.toThrow(/does not support image embeddings/);
  });
});
