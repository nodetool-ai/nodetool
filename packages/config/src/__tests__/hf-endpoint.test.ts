import { afterEach, describe, expect, it } from "vitest";
import { resolveHfEndpoint, rewriteHfHubUrl } from "../hf-endpoint.js";

const FILE =
  "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin";

describe("HF endpoint", () => {
  const saved = process.env["HF_ENDPOINT"];
  afterEach(() => {
    if (saved === undefined) delete process.env["HF_ENDPOINT"];
    else process.env["HF_ENDPOINT"] = saved;
  });

  it("prefers the override, then HF_ENDPOINT, then the public Hub", () => {
    delete process.env["HF_ENDPOINT"];
    expect(resolveHfEndpoint()).toBe("https://huggingface.co");
    expect(resolveHfEndpoint("  ")).toBe("https://huggingface.co");
    process.env["HF_ENDPOINT"] = "https://env.example.com/";
    expect(resolveHfEndpoint()).toBe("https://env.example.com");
    expect(resolveHfEndpoint("https://hf-mirror.com/")).toBe("https://hf-mirror.com");
  });

  it("moves huggingface.co file URLs to the mirror and leaves other hosts alone", () => {
    delete process.env["HF_ENDPOINT"];
    expect(rewriteHfHubUrl(FILE)).toBe(FILE);
    expect(rewriteHfHubUrl(FILE, "https://hf-mirror.com")).toBe(
      "https://hf-mirror.com/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin"
    );
    expect(rewriteHfHubUrl("https://example.com/e.bin", "https://hf-mirror.com")).toBe(
      "https://example.com/e.bin"
    );
  });
});
