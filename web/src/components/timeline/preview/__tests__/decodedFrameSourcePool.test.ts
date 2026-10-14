/**
 * The decoder pool keeps the clips nearest the playhead open, closes the
 * furthest first past the cap, and sends an asset WebCodecs cannot decode to
 * the `<video>` path for good.
 */
import {
  DecodedFrameSourcePool,
  MAX_OPEN_DECODERS,
  type DecodedSourceRequest,
  type OpenDecodedSource
} from "../decodedFrameSourcePool";
import { DecodedFrameSource, type FrameSampleSink } from "../DecodedFrameSource";
import { decodeRejection } from "../../render/clipDecoder";

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

const emptySink: FrameSampleSink = {
  async *samples() {},
  getSample: async () => null
};

function poolWith(open: OpenDecodedSource, onChange = jest.fn()) {
  const pool = new DecodedFrameSourcePool({ onChange, onFailure: jest.fn(), open });
  return { pool, onChange };
}

function request(index: number, distanceMs: number): DecodedSourceRequest {
  return { key: `clip-${index}:url-${index}`, url: `url-${index}`, distanceMs };
}

describe("DecodedFrameSourcePool", () => {
  it("keeps the requests nearest the playhead open past the cap", async () => {
    const disposed: string[] = [];
    const open: OpenDecodedSource = async (url, callbacks) =>
      new DecodedFrameSource({
        ...callbacks,
        width: 1,
        height: 1,
        createSink: () => emptySink,
        onDispose: () => disposed.push(url)
      });
    const { pool } = poolWith(open);
    // 16 upcoming clips, listed furthest first.
    const requests = Array.from({ length: 16 }, (_, i) => request(i, (16 - i) * 100));
    pool.retain(requests);
    await settle();
    const open_ = requests.filter((r) => pool.state(r.key, r.url)?.status === "ready");
    expect(open_).toHaveLength(MAX_OPEN_DECODERS);
    // The four furthest (indices 0-3) are the ones left out.
    expect(open_.map((r) => r.key)).not.toContain("clip-0:url-0");
    expect(pool.state("clip-15:url-15", "url-15")?.status).toBe("ready");

    // An active clip arrives: the furthest open one closes for it.
    pool.retain([request(99, 0), ...requests]);
    await settle();
    expect(pool.state("clip-99:url-99", "url-99")?.status).toBe("ready");
    expect(disposed).toEqual(["url-4"]);
    pool.dispose();
  });

  it("falls back to the element path for an asset WebCodecs rejects", async () => {
    const open: OpenDecodedSource = async () => ({ reason: "rotation" });
    const { pool, onChange } = poolWith(open);
    pool.retain([request(1, 0)]);
    expect(pool.state("clip-1:url-1", "url-1")?.status).toBe("opening");
    await settle();
    expect(pool.state("clip-1:url-1", "url-1")).toEqual({ status: "fallback", reason: "rotation" });
    expect(pool.isFallback("url-1")).toBe(true);
    expect(onChange).toHaveBeenCalled();
    // A second clip on the same asset does not try again.
    pool.retain([{ key: "clip-2:url-1", url: "url-1", distanceMs: 0 }]);
    expect(pool.state("clip-2:url-1", "url-1")?.status).toBe("fallback");
    pool.dispose();
  });

  it("falls back when the decoder fails before the first frame", async () => {
    const failing: FrameSampleSink = {
      // eslint-disable-next-line require-yield
      async *samples() {
        throw new Error("decode failed");
      },
      getSample: async () => {
        throw new Error("decode failed");
      }
    };
    const open: OpenDecodedSource = async (_url, callbacks) =>
      new DecodedFrameSource({ ...callbacks, width: 1, height: 1, createSink: () => failing });
    const { pool } = poolWith(open);
    pool.retain([request(1, 0)]);
    await settle();
    const state = pool.state("clip-1:url-1", "url-1");
    expect(state?.status).toBe("ready");
    if (state?.status === "ready") await state.source.seek(0, "exact");
    await settle();
    expect(pool.state("clip-1:url-1", "url-1")).toEqual({
      status: "fallback",
      reason: "decode-error"
    });
    pool.dispose();
  });

  it("disposes a source that opens after its clip left the pool", async () => {
    let finish: (() => void) | undefined;
    const disposed = jest.fn();
    const open: OpenDecodedSource = (_url, callbacks) =>
      new Promise((resolve) => {
        finish = () =>
          resolve(
            new DecodedFrameSource({
              ...callbacks,
              width: 1,
              height: 1,
              createSink: () => emptySink,
              onDispose: disposed
            })
          );
      });
    const { pool } = poolWith(open);
    pool.retain([request(1, 0)]);
    pool.retain([]);
    finish?.();
    await settle();
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(pool.state("clip-1:url-1", "url-1")).toBeUndefined();
    pool.dispose();
  });
});

describe("decodeRejection", () => {
  const decodable = {
    rotation: 0,
    pixelAspect: { num: 1, den: 1 },
    transparent: false,
    hdr: false
  };

  it.each([
    ["rotation", { rotation: 90 }],
    ["pixel-aspect", { pixelAspect: { num: 4, den: 3 } }],
    ["alpha", { transparent: true }],
    ["hdr", { hdr: true }]
  ])("rejects %s, as the export does", (reason, change) => {
    expect(decodeRejection({ ...decodable, ...change })).toBe(reason);
  });

  it("accepts a plain track", () => {
    expect(decodeRejection(decodable)).toBeNull();
  });
});
