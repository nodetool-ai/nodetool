import {
  modelInfoToEndpointId,
  resolveFalSchemaClient,
} from "../falDynamicSchema";

describe("modelInfoToEndpointId", () => {
  it("returns null for empty input", () => {
    expect(modelInfoToEndpointId("")).toBeNull();
    expect(modelInfoToEndpointId("  ")).toBeNull();
  });

  it("returns endpoint id from a bare path", () => {
    expect(modelInfoToEndpointId("fal-ai/flux-2/klein/4b/base/edit")).toBe(
      "fal-ai/flux-2/klein/4b/base/edit"
    );
  });

  it("trims whitespace from bare path", () => {
    expect(modelInfoToEndpointId("  fal-ai/flux-2  ")).toBe("fal-ai/flux-2");
  });

  it("strips trailing punctuation from endpoint id", () => {
    expect(modelInfoToEndpointId("fal-ai/flux-2.")).toBe("fal-ai/flux-2");
    expect(modelInfoToEndpointId("fal-ai/flux-2)")).toBe("fal-ai/flux-2");
    expect(modelInfoToEndpointId("fal-ai/flux-2;")).toBe("fal-ai/flux-2");
  });

  it("extracts endpoint id from fal.ai model URL", () => {
    expect(
      modelInfoToEndpointId("https://fal.ai/models/fal-ai/flux-2")
    ).toBe("fal-ai/flux-2");
  });

  it("extracts endpoint id from fal.ai URL with trailing slash", () => {
    expect(
      modelInfoToEndpointId("https://fal.ai/models/fal-ai/flux-2/")
    ).toBe("fal-ai/flux-2");
  });

  it("returns null for non-fal HTTP URL", () => {
    expect(
      modelInfoToEndpointId("https://example.com/models/fal-ai/flux-2")
    ).toBeNull();
  });

  it("returns null for fal HTTP URL without /models/ path", () => {
    expect(modelInfoToEndpointId("https://fal.ai/pricing")).toBeNull();
  });

  it("returns null for plain text that is not a path or URL", () => {
    expect(modelInfoToEndpointId("some random text")).toBeNull();
  });
});

describe("resolveFalSchemaClient", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("throws on empty model info", async () => {
    await expect(resolveFalSchemaClient("")).rejects.toThrow(
      /Paste OpenAPI JSON/
    );
  });

  it("throws on whitespace-only model info", async () => {
    await expect(resolveFalSchemaClient("   ")).rejects.toThrow(
      /Paste OpenAPI JSON/
    );
  });

  it("POSTs model_info to backend and returns parsed schema", async () => {
    const mockResponse = {
      dynamic_properties: { steps: { type: "int", default: 20 } },
      dynamic_inputs: {},
      dynamic_outputs: { image: { type: "image" } },
      endpoint_id: "fal-ai/flux-2",
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await resolveFalSchemaClient(
      "fal-ai/flux-2",
      "http://localhost:7777"
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:7777/api/fal/resolve-dynamic-schema",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ model_info: "fal-ai/flux-2" }),
      })
    );
    expect(result.endpoint_id).toBe("fal-ai/flux-2");
    expect(result.dynamic_properties).toEqual(mockResponse.dynamic_properties);
    expect(result.dynamic_outputs).toEqual(mockResponse.dynamic_outputs);
  });

  it("throws specific error for 501 status", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 501,
      text: () => Promise.resolve("Not implemented"),
    });

    await expect(resolveFalSchemaClient("fal-ai/flux-2")).rejects.toThrow(
      /nodetool-fal installed/
    );
  });

  it("throws with detail from 400 JSON response", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () =>
        Promise.resolve(JSON.stringify({ detail: "Unknown model" })),
    });

    await expect(
      resolveFalSchemaClient("fal-ai/nonexistent")
    ).rejects.toThrow("Unknown model");
  });

  it("throws generic error for other HTTP failures", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: () => Promise.resolve("Something broke"),
    });

    await expect(resolveFalSchemaClient("fal-ai/flux-2")).rejects.toThrow(
      "Something broke"
    );
  });

  it("defaults missing fields in response to empty objects", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const result = await resolveFalSchemaClient("fal-ai/flux-2");
    expect(result.dynamic_properties).toEqual({});
    expect(result.dynamic_inputs).toEqual({});
    expect(result.dynamic_outputs).toEqual({});
    expect(result.endpoint_id).toBeUndefined();
  });
});
