/**
 * Mutation-hardening for AkiProvider.
 *
 * Pure helpers are tested directly; the image request flow is driven through a
 * fake AkiClient so every buildImageRequest param mapping, the success/no-data
 * error paths, and the prompt/image guards are pinned. See MUTATION_TESTING.md.
 */
import { describe, it, expect, vi } from "vitest";
import {
  AkiProvider,
  isStringRecord,
  isAkiManifestEntry,
  applyParamRemap,
  withPromptParam,
  shouldRetryWithPromptParam,
  responseImageToBytes,
  uint8ToBase64,
  imageModelsFromEntries,
  buildAkiImageRequest
} from "../../src/providers/aki-provider.js";

describe("pure helpers", () => {
  it("isStringRecord", () => {
    expect(isStringRecord({ a: "x", b: "y" })).toBe(true);
    expect(isStringRecord({ a: 1 })).toBe(false);
    expect(isStringRecord(null)).toBe(false);
    expect(isStringRecord("x")).toBe(false);
    expect(isStringRecord({})).toBe(true);
  });

  it("isAkiManifestEntry", () => {
    const ok = { endpointId: "e", title: "t", outputType: "image" };
    expect(isAkiManifestEntry(ok)).toBe(true);
    expect(isAkiManifestEntry({ ...ok, paramNames: { a: "b" } })).toBe(true);
    expect(isAkiManifestEntry({ ...ok, paramNames: { a: 1 } })).toBe(false);
    expect(isAkiManifestEntry({ title: "t", outputType: "image" })).toBe(false); // no endpointId
    expect(isAkiManifestEntry({ endpointId: "e", outputType: "image" })).toBe(false); // no title
    expect(isAkiManifestEntry({ endpointId: "e", title: "t" })).toBe(false); // no outputType
    expect(isAkiManifestEntry(null)).toBe(false);
  });

  it("applyParamRemap", () => {
    const req = { a: 1, b: 2 };
    expect(applyParamRemap(undefined, req)).toBe(req); // unchanged ref
    expect(applyParamRemap({}, req)).toBe(req);
    expect(applyParamRemap({ a: "x" }, req)).toEqual({ x: 1, b: 2 }); // a→x, b passthrough
  });

  it("withPromptParam", () => {
    // toStrictEqual: a no-op early-return must NOT add a `prompt: undefined` key
    expect(withPromptParam({ foo: 1 })).toStrictEqual({ foo: 1 });
    expect(withPromptParam({ prompt_input: "hi", k: 2 })).toStrictEqual({
      prompt: "hi",
      k: 2
    });
  });

  it("shouldRetryWithPromptParam (needs BOTH clauses)", () => {
    const msg =
      "invalid input parameter(s): prompt_input; missing required argument: prompt";
    expect(shouldRetryWithPromptParam(new Error(msg))).toBe(true);
    expect(shouldRetryWithPromptParam(msg.toUpperCase())).toBe(true); // case-insensitive
    expect(
      shouldRetryWithPromptParam("invalid input parameter(s): prompt_input")
    ).toBe(false); // first clause only
    expect(
      shouldRetryWithPromptParam("missing required argument: prompt")
    ).toBe(false); // second clause only
    expect(shouldRetryWithPromptParam("something else")).toBe(false);
  });

  it("responseImageToBytes", () => {
    expect(responseImageToBytes(null as never)).toBeNull();
    expect(responseImageToBytes([] as never)).toBeNull();
    expect(responseImageToBytes(new Uint8Array([1, 2]) as never)).toEqual(
      new Uint8Array([1, 2])
    );
    expect(responseImageToBytes([new Uint8Array([3])] as never)).toEqual(
      new Uint8Array([3])
    );
    expect(Array.from(responseImageToBytes(Buffer.from([4, 5]) as never)!)).toEqual([4, 5]);
    expect(responseImageToBytes(42 as never)).toBeNull(); // non-decodable
  });

  it("uint8ToBase64", () => {
    expect(uint8ToBase64(new Uint8Array([1, 2, 3]))).toBe("AQID");
  });

  it("imageModelsFromEntries filters image entries and maps tasks", () => {
    const out = imageModelsFromEntries([
      { endpointId: "i1", title: "I1", outputType: "image", supportedTasks: ["text_to_image"] },
      { endpointId: "i2", title: "I2", outputType: "image", supportedTasks: [] },
      { endpointId: "v1", title: "V1", outputType: "video" }
    ]);
    expect(out).toEqual([
      { id: "i1", name: "I1", provider: "aki", supportedTasks: ["text_to_image"] },
      { id: "i2", name: "I2", provider: "aki", supportedTasks: undefined }
    ]);
  });

  it("buildAkiImageRequest maps all params, omits absent/null/sentinel ones (pure)", () => {
    // every optional present → mapped to snake_case keys
    expect(
      buildAkiImageRequest("  cat  " as never, {
        width: 512,
        height: 256,
        negativePrompt: "blur",
        guidanceScale: 7.5,
        numInferenceSteps: 30,
        seed: 42,
        scheduler: "ddim",
        quality: "hd",
        safetyCheck: false
      } as never)
    ).toStrictEqual({
      prompt_input: "  cat  ", // not trimmed here (the method trims before calling)
      width: 512,
      height: 256,
      negative_prompt: "blur",
      guidance_scale: 7.5,
      num_inference_steps: 30,
      seed: 42,
      scheduler: "ddim",
      safety_check: false,
      quality: "hd"
    });
    // none present (+ seed sentinel -1) → only prompt_input (pins each guard)
    expect(
      buildAkiImageRequest("p" as never, { seed: -1 } as never)
    ).toStrictEqual({ prompt_input: "p" });
    // image + image-to-image dimensions/strength
    expect(
      buildAkiImageRequest("p" as never, { targetWidth: 8, targetHeight: 9, strength: 0.5 } as never, new Uint8Array([1, 2, 3]))
    ).toStrictEqual({ prompt_input: "p", image: "AQID", width: 8, height: 9, strength: 0.5 });
  });

  it("imageModelsFromEntries falls back to defaults when no image entries", () => {
    expect(imageModelsFromEntries([{ endpointId: "v", title: "V", outputType: "video" }])).toEqual([
      { id: "sdxl_img", name: "SDXL", provider: "aki", supportedTasks: ["text_to_image"] },
      { id: "flux-text2img", name: "FLUX Text to Image", provider: "aki", supportedTasks: ["text_to_image"] },
      { id: "flux-img2img", name: "FLUX Image to Image", provider: "aki", supportedTasks: ["image_to_image"] }
    ]);
  });
});

function makeProvider(doApiRequest: ReturnType<typeof vi.fn>) {
  const factory = vi.fn().mockReturnValue({ doApiRequest });
  const provider = new AkiProvider(
    { AKI_API_KEY: "k" },
    { client: {} as never, akiClientFactory: factory as never }
  );
  return { provider, factory };
}
const model = (id = "test-model") => ({ id, name: id, provider: "aki" as const });

describe("client construction", () => {
  it("builds the OpenAI-compatible client at the AKI base URL by default", () => {
    const p = new AkiProvider({ AKI_API_KEY: "k" }) as unknown as {
      getClient: () => { baseURL: string };
    };
    expect(p.getClient().baseURL).toBe("https://aki.io/v1");
  });

  it("configures the AkiClient with the endpoint, key, and binary options", async () => {
    const { provider, factory } = makeProvider(
      vi.fn().mockResolvedValue({ success: true, images: [new Uint8Array([1])] })
    );
    await provider.textToImage({ model: model("ep-1"), prompt: "x" } as never);
    expect(factory).toHaveBeenCalledWith({
      endpointName: "ep-1",
      apiKey: "k",
      outputBinaryFormat: "byteString",
      raiseExceptions: true,
      returnToolCallDict: true
    });
  });
});

describe("buildImageRequest mapping (via textToImage)", () => {
  const okResult = { success: true, images: [new Uint8Array([1])] };

  it("maps every optional param to its snake_case request key", async () => {
    const doApiRequest = vi.fn().mockResolvedValue(okResult);
    const { provider: p } = makeProvider(doApiRequest);
    await p.textToImage({
      model: model(),
      prompt: "  a cat  ",
      width: 512,
      height: 256,
      negativePrompt: "blurry",
      guidanceScale: 7.5,
      numInferenceSteps: 30,
      seed: 42,
      scheduler: "ddim",
      quality: "hd",
      safetyCheck: false
    } as never);
    expect(doApiRequest.mock.calls[0][0]).toStrictEqual({
      prompt_input: "a cat", // trimmed
      width: 512,
      height: 256,
      negative_prompt: "blurry",
      guidance_scale: 7.5,
      num_inference_steps: 30,
      seed: 42,
      scheduler: "ddim",
      safety_check: false,
      quality: "hd"
    });
  });

  it("omits seed === -1 and every absent optional (strict: no undefined keys)", async () => {
    const doApiRequest = vi.fn().mockResolvedValue(okResult);
    const { provider: p } = makeProvider(doApiRequest);
    await p.textToImage({ model: model(), prompt: "x", seed: -1 } as never);
    // toStrictEqual fails if any `if (x != null)` was forced true (adds x:undefined)
    expect(doApiRequest.mock.calls[0][0]).toStrictEqual({ prompt_input: "x" });
  });

  it("omits safetyCheck/strength when the key is present but null", async () => {
    const doApiRequest = vi.fn().mockResolvedValue(okResult);
    const { provider: p } = makeProvider(doApiRequest);
    await p.imageToImage(new Uint8Array([1]), {
      model: model(),
      prompt: "x",
      safetyCheck: null,
      strength: null
    } as never);
    const req = doApiRequest.mock.calls[0][0];
    expect("safety_check" in req).toBe(false);
    expect("strength" in req).toBe(false);
  });

  it("imageToImage adds the base64 image, strength, and target dimensions", async () => {
    const doApiRequest = vi
      .fn()
      .mockResolvedValue({ success: true, images: [new Uint8Array([9])] });
    const { provider: p } = makeProvider(doApiRequest);
    await p.imageToImage(new Uint8Array([1, 2, 3]), {
      model: model(),
      prompt: "edit",
      targetWidth: 128,
      targetHeight: 64,
      strength: 0.8
    } as never);
    const req = doApiRequest.mock.calls[0][0];
    expect(req.image).toBe("AQID");
    expect(req.width).toBe(128);
    expect(req.height).toBe(64);
    expect(req.strength).toBe(0.8);
  });
});

describe("runImageRequest error handling", () => {
  it("throws the API error message on failure", async () => {
    const { provider } = makeProvider(
      vi.fn().mockResolvedValue({ success: false, error: "boom" })
    );
    await expect(
      provider.textToImage({ model: model(), prompt: "x" } as never)
    ).rejects.toThrow("boom");
  });

  it("throws a coded message (numeric and 'unknown') when no error string", async () => {
    const coded = makeProvider(
      vi.fn().mockResolvedValue({ success: false, error_code: 503 })
    );
    await expect(
      coded.provider.textToImage({ model: model(), prompt: "x" } as never)
    ).rejects.toThrow("code 503");

    const unknown = makeProvider(vi.fn().mockResolvedValue({ success: false }));
    await expect(
      unknown.provider.textToImage({ model: model(), prompt: "x" } as never)
    ).rejects.toThrow("code unknown");
  });

  it("throws when the response has no image bytes", async () => {
    const { provider } = makeProvider(
      vi.fn().mockResolvedValue({ success: true, images: [] })
    );
    await expect(
      provider.textToImage({ model: model(), prompt: "x" } as never)
    ).rejects.toThrow("no image data");
  });

  it("re-throws (without retrying) when the error is not the prompt_input case", async () => {
    const doApiRequest = vi.fn().mockRejectedValue(new Error("other failure"));
    const { provider } = makeProvider(doApiRequest);
    await expect(
      provider.textToImage({ model: model(), prompt: "x" } as never)
    ).rejects.toThrow("other failure");
    expect(doApiRequest).toHaveBeenCalledTimes(1); // not retried
  });

  it("retries with the prompt alias on a prompt_input error", async () => {
    const doApiRequest = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          "invalid input parameter(s): prompt_input; missing required argument: prompt"
        )
      )
      .mockResolvedValue({ success: true, images: [new Uint8Array([7])] });
    const { provider } = makeProvider(doApiRequest);
    await provider.textToImage({ model: model(), prompt: "hi" } as never);
    expect(doApiRequest).toHaveBeenCalledTimes(2);
    expect(doApiRequest.mock.calls[1][0]).toHaveProperty("prompt", "hi");
    expect(doApiRequest.mock.calls[1][0]).not.toHaveProperty("prompt_input");
  });
});

describe("prompt / image guards", () => {
  it("textToImage rejects a blank prompt", async () => {
    const { provider: p } = makeProvider(vi.fn());
    await expect(
      p.textToImage({ model: model(), prompt: "   " } as never)
    ).rejects.toThrow("Prompt is required");
  });

  it("imageToImage rejects a blank prompt and an empty image", async () => {
    const { provider: p } = makeProvider(vi.fn());
    await expect(
      p.imageToImage(new Uint8Array([1]), { model: model(), prompt: " " } as never)
    ).rejects.toThrow("Prompt is required");
    await expect(
      p.imageToImage(new Uint8Array([]), { model: model(), prompt: "ok" } as never)
    ).rejects.toThrow("Image is required");
  });
});

describe("getAvailableLanguageModels", () => {
  it("keeps non-empty string ids with name fallback", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: "a", name: "A" }, { id: "b" }, { id: "" }, { name: "no-id" }, { id: 5 }]
      })
    });
    const p = new AkiProvider(
      { AKI_API_KEY: "k" },
      { client: {} as never, fetchFn: fetchFn as never }
    );
    expect(await p.getAvailableLanguageModels()).toEqual([
      { id: "a", name: "A", provider: "aki" },
      { id: "b", name: "b", provider: "aki" }
    ]);
  });

  it("returns [] for a not-ok response with a body", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ data: [{ id: "x" }] })
    });
    const p = new AkiProvider(
      { AKI_API_KEY: "k" },
      { client: {} as never, fetchFn: fetchFn as never }
    );
    expect(await p.getAvailableLanguageModels()).toEqual([]);
  });
});
