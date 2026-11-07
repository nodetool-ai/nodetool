/**
 * The provider's capability methods and the nodes' endpoint calls must put the
 * same request on the wire. The node path runs through callProviderEndpoint
 * into a second TogetherProvider, so both sides stop at a stubbed fetch.
 */
import { describe, expect, it, vi } from "vitest";
import { ProcessingContext, TogetherProvider } from "@nodetool-ai/runtime";
import {
  togetherGenerateImage,
  togetherTextToSpeech
} from "../src/together-base.js";

const model = { id: "test/image", name: "Test", provider: "together" as const };
const image = Uint8Array.from([255, 216, 255, 1]);
const imageResponse = () => Response.json({ data: [{ b64_json: "aGk=" }] });
const audioResponse = () => new Response(Uint8Array.from([1, 2]));
const provider = (fetchFn: typeof fetch) =>
  new TogetherProvider({ TOGETHER_API_KEY: "tk" }, { fetchFn });
/** A context whose `together` provider sends through `fetchFn`. */
const nodeContext = (fetchFn: typeof fetch): ProcessingContext => {
  const context = new ProcessingContext({ jobId: "job-1" });
  context.setProviderResolver(() => provider(fetchFn));
  return context;
};
function request(fetchFn: ReturnType<typeof vi.fn>): unknown {
  const [url, init] = fetchFn.mock.calls[0];
  return {
    url,
    headers: init.headers,
    body: JSON.parse(init.body)
  };
}

describe("Together adapter wire parity", () => {
  it("maps optional image parameters identically, including zero values", async () => {
    const runtimeFetch = vi.fn<typeof fetch>(async () => imageResponse());
    const nodeFetch = vi.fn<typeof fetch>(async () => imageResponse());
    const runtime = await provider(runtimeFetch).textToImage({
      model,
      prompt: "fox",
      width: 512,
      height: 768,
      numInferenceSteps: 4,
      guidanceScale: 0,
      seed: 0,
      negativePrompt: "blur"
    });
    const node = await togetherGenerateImage(
      nodeContext(nodeFetch),
      model.id,
      {
        prompt: "fox",
        width: 512,
        height: 768,
        steps: 4,
        guidanceScale: 0,
        seed: 0,
        negativePrompt: "blur"
      },
      "text_to_image"
    );
    expect(request(runtimeFetch)).toEqual(request(nodeFetch));
    expect(runtime).toEqual(node);
  });

  it("maps a JPEG image edit identically", async () => {
    const runtimeFetch = vi.fn<typeof fetch>(async () => imageResponse());
    const nodeFetch = vi.fn<typeof fetch>(async () => imageResponse());
    const runtime = await provider(runtimeFetch).imageToImage([image], {
      model,
      prompt: "fox",
      targetWidth: 512,
      numInferenceSteps: 4,
      seed: 0
    });
    const node = await togetherGenerateImage(
      nodeContext(nodeFetch),
      model.id,
      {
        prompt: "fox",
        imageUrl: `data:image/jpeg;base64,${Buffer.from(image).toString("base64")}`,
        width: 512,
        steps: 4,
        seed: 0
      },
      "image_to_image"
    );
    expect(request(runtimeFetch)).toEqual(request(nodeFetch));
    expect(runtime).toEqual(node);
  });

  it.each([{}, { voice: "leah", speed: 0, format: "WAV" }])(
    "maps speech defaults and optional values identically: %j",
    async (params) => {
      const runtimeFetch = vi.fn<typeof fetch>(async () => audioResponse());
      const nodeFetch = vi.fn<typeof fetch>(async () => audioResponse());
      const runtime = await provider(runtimeFetch).textToSpeechEncoded({
        text: "hello",
        model: "test/speech",
        voice: params.voice,
        speed: params.speed,
        audioFormat: params.format
      });
      const node = await togetherTextToSpeech(
        nodeContext(nodeFetch),
        "test/speech",
        { text: "hello", ...params }
      );
      expect(request(runtimeFetch)).toEqual(request(nodeFetch));
      expect(runtime).toEqual(node);
    }
  );

  it("preserves error labels for generation, editing and speech", async () => {
    const fetchFn = vi.fn<typeof fetch>(
      async () => new Response("quota", { status: 429 })
    );
    const runtime = provider(fetchFn);
    await expect(runtime.textToImage({ model, prompt: "fox" })).rejects.toThrow(
      "Together image generation failed: quota"
    );
    await expect(
      togetherGenerateImage(
        nodeContext(fetchFn),
        model.id,
        { prompt: "fox" },
        "text_to_image"
      )
    ).rejects.toThrow("Together image generation failed: quota");
    await expect(
      runtime.imageToImage([image], { model, prompt: "fox" })
    ).rejects.toThrow("Together image editing failed: quota");
    await expect(
      runtime.textToSpeechEncoded({ model: "test/speech", text: "hello" })
    ).rejects.toThrow("Together TTS failed: quota");
    await expect(
      togetherTextToSpeech(nodeContext(fetchFn), "test/speech", {
        text: "hello"
      })
    ).rejects.toThrow("Together TTS failed: quota");
  });

  it("cancels both image adapters through the caller's signal", async () => {
    const signal = AbortSignal.abort();
    const fetchFn = vi.fn<typeof fetch>(async (_url, init) => {
      init?.signal?.throwIfAborted();
      return imageResponse();
    });
    await expect(
      provider(fetchFn).textToImage({ model, prompt: "fox", signal })
    ).rejects.toMatchObject({ name: "AbortError" });
    // The node path cancels through the run's signal, which the generation
    // seam chains into the signal it hands the provider.
    const context = nodeContext(fetchFn);
    context.signal = signal;
    await expect(
      togetherGenerateImage(context, model.id, { prompt: "fox" }, "text_to_image")
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchFn.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(
      true
    );
  });

  it("rejects result redirects into a private host before fetching it", async () => {
    const fetchFn = vi.fn<typeof fetch>(async (url) =>
      String(url).includes("/images/generations")
        ? Response.json({
            data: [{ url: "https://cdn.example.com/image.jpg" }]
          })
        : new Response(null, {
            status: 302,
            headers: { location: "http://127.0.0.1/private" }
          })
    );
    await expect(
      provider(fetchFn).textToImage({ model, prompt: "fox" })
    ).rejects.toThrow();
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[1][1]?.redirect).toBe("manual");
  });

  it("cancels the generated image download", async () => {
    const controller = new AbortController();
    const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).includes("/images/generations")) {
        return Response.json({
          data: [{ url: "https://cdn.example.com/image.jpg" }]
        });
      }
      expect(init?.signal).toBe(controller.signal);
      controller.abort();
      init?.signal?.throwIfAborted();
      return imageResponse();
    });
    await expect(
      provider(fetchFn).textToImage({
        model,
        prompt: "fox",
        signal: controller.signal
      })
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
