import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("../src/topaz-base.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/topaz-base.js")>();
  return {
    ...actual,
    getApiKey: () => "test-key",
    refToBytes: vi.fn(async () => Uint8Array.from([1, 2, 3])),
    topazExecuteImageTask: vi.fn(async () => Uint8Array.from([4, 5, 6])),
    topazImageRef: vi.fn(async () => ({ type: "image", uri: "", data: "" }))
  };
});

import { createTopazNodeClass } from "../src/topaz-factory.js";
import type { TopazManifestEntry } from "../src/topaz-factory.js";
import { topazExecuteImageTask } from "../src/topaz-base.js";

const spec: TopazManifestEntry = {
  className: "Upscale",
  moduleName: "image",
  modelId: "std-v2",
  title: "Upscale",
  description: "test",
  outputType: "image",
  submitEndpoint: "https://api.topazlabs.com/image/v1/enhance",
  statusEndpoint: "https://api.topazlabs.com/image/v1/status/{process_id}",
  downloadEndpoint: "https://api.topazlabs.com/image/v1/download/{process_id}",
  pollInterval: 10,
  maxAttempts: 3,
  fields: [
    { name: "image", type: "image", uploadField: true },
    { name: "model", type: "str", default: "Standard V2" },
    { name: "output_width", type: "int", default: 0 }
  ]
};

describe("createTopazNodeClass scalar coercion", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("drops a numeric field that cannot be coerced instead of sending NaN", async () => {
    const NodeClass = createTopazNodeClass(spec) as unknown as new () => {
      image: unknown;
      output_width: unknown;
      process: () => Promise<Record<string, unknown>>;
    };
    const node = new NodeClass();
    node.image = { type: "image", uri: "", data: "AQID" };
    // A saved graph can carry a non-numeric string in a numeric slot.
    node.output_width = "auto";

    await node.process();

    const fields = vi.mocked(topazExecuteImageTask).mock.calls[0][2];
    // String(NaN) is "NaN" — the submit form skips null, never the literal.
    expect(Number.isNaN(fields.output_width)).toBe(false);
    expect(fields.output_width).toBeNull();
  });
});
