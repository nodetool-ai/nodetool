/**
 * Regression: a remote model download over 4 GiB used to kill the bridge.
 *
 * Python's msgpack encodes an integer above 2^32 as a `uint64` (wire type
 * 0xcf). msgpackr decodes that to a BigInt unless told otherwise, so
 * `ModelDownloadUpdate.total_bytes` — declared `number` — arrived as a BigInt
 * and every consumer that divides, truncates or Zod-validates it threw. The
 * observable failure was `TypeError: Cannot mix BigInt and other types`,
 * logged as an undecodable frame, on any repo larger than 4 GiB (which is most
 * diffusion models).
 */

import { describe, it, expect, afterEach } from "vitest";
import { pack, unpack } from "msgpackr";

import {
  packBridgeMessage,
  unpackBridgeMessage
} from "../src/python-bridge-codec.js";
import { WebsocketPythonBridge } from "../src/python-websocket-bridge.js";
import type { ModelDownloadUpdate } from "../src/python-bridge-types.js";
import {
  startFakeWorker,
  type FakeWorkerHandle
} from "./python-websocket-bridge.test-helpers.js";

/** 16 GiB — above 2^32, so Python emits it as a uint64. */
const HUGE = 17179869184;

/**
 * Encode like Python's msgpack does, which is the only way to produce the
 * frame that broke: msgpackr's own `pack` writes a large JS number as a
 * float64 (0xcb) and never as a uint64, so it cannot reproduce this.
 */
function pyPack(value: unknown): Uint8Array {
  const out: number[] = [];
  const write = (v: unknown): void => {
    if (v === null || v === undefined) {
      out.push(0xc0);
    } else if (typeof v === "boolean") {
      out.push(v ? 0xc3 : 0xc2);
    } else if (typeof v === "number") {
      if (!Number.isInteger(v) || v < 0) {
        throw new Error("pyPack only covers non-negative integers");
      }
      if (v < 0x80) {
        out.push(v);
      } else if (v <= 0xffffffff) {
        out.push(0xce, (v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
      } else {
        const hi = Math.floor(v / 0x100000000);
        const lo = v >>> 0;
        out.push(
          0xcf,
          (hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff,
          (lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff
        );
      }
    } else if (typeof v === "string") {
      const bytes = new TextEncoder().encode(v);
      if (bytes.length < 32) {
        out.push(0xa0 | bytes.length);
      } else {
        out.push(0xd9, bytes.length);
      }
      out.push(...bytes);
    } else if (Array.isArray(v)) {
      out.push(0x90 | v.length);
      for (const item of v) write(item);
    } else {
      const entries = Object.entries(v as Record<string, unknown>);
      out.push(0x80 | entries.length);
      for (const [k, val] of entries) {
        write(k);
        write(val);
      }
    }
  };
  write(value);
  return new Uint8Array(out);
}

describe("python bridge codec", () => {
  it("reads a Python uint64 as a number, not a BigInt", () => {
    const wire = pyPack({ total_bytes: HUGE });

    // The trap this codec exists to close — pinned so a msgpackr upgrade that
    // changes the default is visible here rather than in a broken download.
    expect(typeof (unpack(wire) as Record<string, unknown>).total_bytes).toBe(
      "bigint"
    );

    const decoded = unpackBridgeMessage(wire);
    expect(typeof decoded.total_bytes).toBe("number");
    expect(decoded.total_bytes).toBe(HUGE);
    // What every consumer actually does with it.
    expect(Math.round(((HUGE / 2) / (decoded.total_bytes as number)) * 100)).toBe(50);
  });

  it("decodes an ordinary frame exactly like msgpackr's own unpack", () => {
    const frame = {
      type: "result",
      request_id: "abc",
      data: { outputs: { a: [1, 2] }, ok: true, missing: null }
    };
    const bytes = packBridgeMessage(frame);
    // A hand-built Unpackr drops `mapsAsObjects`, which would hand callers a
    // Map instead of a frame object and break the whole bridge.
    expect(unpackBridgeMessage(bytes)).toEqual(unpack(bytes));
    expect(unpackBridgeMessage(bytes)).toEqual(frame);
  });

  it("keeps binary payloads as bytes", () => {
    const bytes = packBridgeMessage({ blob: new Uint8Array([1, 2, 3]) });
    const blob = unpackBridgeMessage(bytes).blob;
    expect(blob).toBeInstanceOf(Uint8Array);
    expect(Array.from(blob as Uint8Array)).toEqual([1, 2, 3]);
  });
});

describe("model download over 4 GiB", () => {
  let worker: FakeWorkerHandle | undefined;
  let bridge: WebsocketPythonBridge | undefined;

  afterEach(async () => {
    bridge?.close();
    await worker?.close();
    worker = undefined;
    bridge = undefined;
  });

  it("delivers a uint64 byte count to onProgress as a usable number", async () => {
    // "hang" so the fake worker emits its start frame and then stays quiet —
    // this test drives the rest of the exchange with real Python wire bytes.
    worker = await startFakeWorker(0, { downloadMode: "hang" });
    bridge = new WebsocketPythonBridge({
      wsUrl: `ws://127.0.0.1:${worker.port}`,
      autoRestart: false
    });
    await bridge.connect();

    const requestId = "download-1";
    const seen: ModelDownloadUpdate[] = [];
    const progressed = new Promise<void>((resolve) => {
      const done = bridge!.downloadModel(
        { repo_id: "org/huge" },
        (u) => {
          seen.push(u);
          if (u.status === "progress") resolve();
        },
        requestId
      );
      void done.catch(() => {});
    });

    // Wait for the bridge to register the request, then answer as Python does.
    await new Promise((r) => setTimeout(r, 50));
    const socket = [...worker.sockets()][0];
    socket.send(
      pyPack({
        type: "progress",
        request_id: requestId,
        data: {
          status: "progress",
          repo_id: "org/huge",
          path: null,
          model_type: null,
          downloaded_bytes: HUGE / 2,
          total_bytes: HUGE,
          downloaded_files: 1,
          current_files: ["model.safetensors"],
          total_files: 2
        }
      })
    );
    await progressed;
    socket.send(
      pack({
        type: "result",
        request_id: requestId,
        data: { repo_id: "org/huge", status: "completed" }
      })
    );

    const update = seen.find((u) => u.status === "progress");
    expect(update).toBeDefined();
    expect(typeof update!.total_bytes).toBe("number");
    expect(update!.total_bytes).toBe(HUGE);
    // The arithmetic the CLI and the web download store do on every frame.
    expect(
      Math.floor((update!.downloaded_bytes / update!.total_bytes) * 100)
    ).toBe(50);
  });
});
