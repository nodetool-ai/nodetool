import { resolveReplicateSchemaClient } from "../replicateDynamicSchema";

describe("resolveReplicateSchemaClient", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("throws on empty model info", async () => {
    await expect(resolveReplicateSchemaClient("")).rejects.toThrow(
      /Paste a Replicate model identifier/
    );
  });

  it("throws on whitespace-only model info", async () => {
    await expect(resolveReplicateSchemaClient("   ")).rejects.toThrow(
      /Paste a Replicate model identifier/
    );
  });

  it("POSTs model_info to backend and returns parsed schema", async () => {
    const mockResponse = {
      model_id: "runwayml/gen-4.5",
      dynamic_properties: { prompt: { type: "string" } },
      dynamic_inputs: {
        prompt: { type: "string", description: "Text prompt" },
      },
      dynamic_outputs: { output: { type: "video" } },
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await resolveReplicateSchemaClient(
      "runwayml/gen-4.5",
      "http://localhost:7777"
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:7777/api/replicate/resolve-dynamic-schema",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ model_info: "runwayml/gen-4.5" }),
      })
    );
    expect(result.model_id).toBe("runwayml/gen-4.5");
    expect(result.dynamic_properties).toEqual(mockResponse.dynamic_properties);
    expect(result.dynamic_outputs).toEqual(mockResponse.dynamic_outputs);
  });

  it("uses same-origin when no base URL provided", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ dynamic_properties: {}, dynamic_outputs: {} }),
    });

    await resolveReplicateSchemaClient("stability-ai/sdxl");

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/replicate/resolve-dynamic-schema",
      expect.any(Object)
    );
  });

  it("throws specific error for 501 status", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 501,
      text: () => Promise.resolve("Not implemented"),
    });

    await expect(
      resolveReplicateSchemaClient("runwayml/gen-4.5")
    ).rejects.toThrow(/nodetool-replicate installed/);
  });

  it("throws with detail from 400 JSON response", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () =>
        Promise.resolve(JSON.stringify({ detail: "Model not found" })),
    });

    await expect(
      resolveReplicateSchemaClient("invalid/model")
    ).rejects.toThrow("Model not found");
  });

  it("falls back to raw text when response is not JSON", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("plain text error"),
    });

    await expect(
      resolveReplicateSchemaClient("invalid/model")
    ).rejects.toThrow("plain text error");
  });

  it("throws generic error for other HTTP failures", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      text: () => Promise.resolve(""),
    });

    await expect(
      resolveReplicateSchemaClient("runwayml/gen-4.5")
    ).rejects.toThrow(/Failed to load schema: 503/);
  });

  it("defaults missing fields in response to empty objects", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const result = await resolveReplicateSchemaClient("some/model");
    expect(result.dynamic_properties).toEqual({});
    expect(result.dynamic_inputs).toEqual({});
    expect(result.dynamic_outputs).toEqual({});
    expect(result.model_id).toBeUndefined();
  });
});
