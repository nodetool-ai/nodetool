/**
 * Each case is a shape `replicate.run()`'s output walk can produce. Reading
 * only `output[0]` dropped most of them and reported "no usable output" for a
 * prediction that succeeded (#5194).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  decodeReplicateOutput,
  ReplicateProvider
} from "../../src/providers/replicate-provider.js";

const IMG = new Uint8Array([137, 80, 78, 71]);
const URL_A = "https://replicate.delivery/pbxt/a.webp";
const URL_B = "https://replicate.delivery/pbxt/b.webp";

/** The SDK's FileOutput: a ReadableStream that also carries `url()`. */
function fileOutput(url: string, bytes: Uint8Array) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    }
  }) as ReadableStream<Uint8Array> & { url: () => URL };
  stream.url = () => new URL(url);
  return stream;
}

/** A FileOutput that lost its stream half — only the locator is left. */
function urlOnlyOutput(url: string) {
  return { url: () => new URL(url) };
}

function stubFetchOk(bytes: Uint8Array) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers(),
    arrayBuffer: () => Promise.resolve(bytes.buffer)
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function textToImage(output: unknown) {
  const provider = new ReplicateProvider(
    { REPLICATE_API_TOKEN: "r8_test" },
    {
      client: {
        run: vi.fn().mockResolvedValue(output),
        stream: vi.fn()
      } as never
    }
  );
  return provider.textToImage({
    model: {
      id: "black-forest-labs/flux-schnell",
      name: "FLUX schnell",
      provider: "replicate"
    },
    prompt: "a red fox in snow"
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("decodeReplicateOutput", () => {
  it("reads an array of URL strings (flux-schnell, flux-dev)", () => {
    expect(decodeReplicateOutput([URL_A, URL_B])).toEqual({
      kind: "url",
      url: URL_A
    });
  });

  it("reads a bare string output, URL-shaped or not", () => {
    expect(decodeReplicateOutput(URL_A)).toEqual({ kind: "url", url: URL_A });
    expect(decodeReplicateOutput("/tmp/out.png")).toEqual({
      kind: "url",
      url: "/tmp/out.png"
    });
  });

  it("reads a FileOutput nested under an object key", () => {
    const decoded = decodeReplicateOutput({ image: fileOutput(URL_A, IMG) });
    expect(decoded?.kind).toBe("stream");
  });

  it("reads an object whose file sits behind a non-file sibling", () => {
    expect(decodeReplicateOutput({ seed: 12345, output: [URL_A] })).toEqual({
      kind: "url",
      url: URL_A
    });
  });

  it("reads an array of objects that wrap the url", () => {
    expect(decodeReplicateOutput([{ url: URL_A }])).toEqual({
      kind: "url",
      url: URL_A
    });
  });

  it("skips array elements that carry no file", () => {
    expect(decodeReplicateOutput([null, "not a url", URL_B])).toEqual({
      kind: "url",
      url: URL_B
    });
  });

  it("calls url() when the FileOutput has no stream half", () => {
    expect(decodeReplicateOutput(urlOnlyOutput(URL_A))).toEqual({
      kind: "url",
      url: URL_A
    });
  });

  it("prefers the stream over url() — the bytes are already in flight", () => {
    expect(decodeReplicateOutput(fileOutput(URL_A, IMG))?.kind).toBe("stream");
  });

  it("does not mistake a nested non-URL string for a locator", () => {
    expect(decodeReplicateOutput({ prompt: "a red fox in snow" })).toBeNull();
  });

  it("returns null for outputs that carry no file", () => {
    expect(decodeReplicateOutput(null)).toBeNull();
    expect(decodeReplicateOutput(123)).toBeNull();
    expect(decodeReplicateOutput("")).toBeNull();
    expect(decodeReplicateOutput([])).toBeNull();
    expect(decodeReplicateOutput({})).toBeNull();
  });
});

describe("ReplicateProvider output handling", () => {
  it("returns the bytes of an object-wrapped FileOutput", async () => {
    await expect(
      textToImage({ image: fileOutput(URL_A, IMG) })
    ).resolves.toEqual(IMG);
  });

  it("fetches the url of an array-of-objects output", async () => {
    const fetchMock = stubFetchOk(IMG);
    await expect(textToImage([{ url: URL_A }])).resolves.toEqual(IMG);
    expect(fetchMock.mock.calls[0][0]).toBe(URL_A);
  });

  it("decodes an inline data URI, which safeFetch cannot reach", async () => {
    const uri = `data:image/png;base64,${Buffer.from(IMG).toString("base64")}`;
    await expect(textToImage([uri])).resolves.toEqual(IMG);
  });

  it("names the shape it got when nothing in the output is a file", async () => {
    await expect(textToImage({ seed: 1, nsfw: true })).rejects.toThrow(
      "no usable output (output was an object with keys [seed, nsfw])"
    );
    await expect(textToImage([])).rejects.toThrow(
      "no usable output (output was an array of 0)"
    );
  });
});
