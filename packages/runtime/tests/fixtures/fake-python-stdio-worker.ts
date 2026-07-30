/**
 * A faithful stdio fake for `python -m nodetool.worker --stdio`.
 *
 * Speaks the REAL wire protocol — length-prefixed msgpack over stdin/stdout,
 * "NODETOOL_STDIO_READY" on stderr — using the SAME framing module
 * (`src/python-bridge-framing.ts`) as the real bridge, so this fake and
 * `PythonStdioBridge` can never disagree about the wire format.
 *
 * Spawned as a real child process by `python-stdio-bridge.test.ts` (via
 * `node --import tsx`), so the genuine stdio path — pipes, buffering, process
 * lifecycle — is exercised, not an in-memory stand-in.
 *
 * Scripted entirely through environment variables (kept simple — this is a
 * test fixture spawned via `child_process.spawn`, not a library with a JS
 * API):
 *
 * - `FAKE_WORKER_MODE=never-ready`      never emit the ready signal (spawn-timeout fault)
 * - `FAKE_WORKER_EXIT_ON_TYPE=<type>`   exit(1) on receiving a request of this type,
 *                                       without responding (mid-request exit fault)
 * - `FAKE_WORKER_IGNORE_TYPE=<type>`    silently drop requests of this type (no reply,
 *                                       process stays alive) — leaves the request
 *                                       pending forever, for tests that need an
 *                                       in-flight request when another fault hits
 * - `FAKE_WORKER_BAD_LENGTH_ON_TYPE=<type>` reply to this request type with a
 *                                       frame whose length prefix is absurdly large
 *                                       instead of a real frame (framing-violation fault)
 * - `FAKE_WORKER_SPLIT_FRAMES=1`        split every outgoing frame into two writes with
 *                                       a tick in between (frame-split-across-chunks)
 * - `FAKE_WORKER_COALESCE_FILLER=1`     bundle an extra harmless frame with the discover
 *                                       reply so both arrive in a single stdout write
 *                                       (multi-frame-in-one-chunk)
 * - `FAKE_WORKER_NODE_TYPE=<type>`      node_type reported by discover (default
 *                                       "fake.TestNode")
 * - `FAKE_WORKER_READY_DELAY_MS=<ms>`   delay before emitting the ready signal
 *
 * `FAKE_WORKER_CLOSE_STDIN_AFTER_MS` / `FAKE_WORKER_CLOSE_STDOUT_AFTER_MS`
 * (broken-pipe / close-stdout-early faults) are handled by
 * `fake-python-interpreter.mjs`, not here — see that file for why closing a
 * stream in THIS process would not actually break the real pipe.
 */

import { pack, unpack } from "msgpackr";
import { encodeFrame, FrameDecoder } from "../../src/python-bridge-framing.js";

const mode = process.env.FAKE_WORKER_MODE ?? "normal";
const exitOnType = process.env.FAKE_WORKER_EXIT_ON_TYPE;
const ignoreType = process.env.FAKE_WORKER_IGNORE_TYPE;
const badLengthOnType = process.env.FAKE_WORKER_BAD_LENGTH_ON_TYPE;
const splitFrames = process.env.FAKE_WORKER_SPLIT_FRAMES === "1";
const coalesceFiller = process.env.FAKE_WORKER_COALESCE_FILLER === "1";
const nodeType = process.env.FAKE_WORKER_NODE_TYPE ?? "fake.TestNode";
const readyDelayMs = Number(process.env.FAKE_WORKER_READY_DELAY_MS ?? 0);

type Frame = Record<string, unknown>;

function toBuffer(msg: Frame): Buffer {
  return encodeFrame(Buffer.from(pack(msg)));
}

/** Send one frame, honoring the split-frames fault knob. */
function sendFrame(msg: Frame): void {
  const frame = toBuffer(msg);
  if (splitFrames) {
    const mid = Math.max(1, Math.floor(frame.length / 2));
    process.stdout.write(frame.subarray(0, mid));
    setTimeout(() => {
      process.stdout.write(frame.subarray(mid));
    }, 5);
    return;
  }
  process.stdout.write(frame);
}

/** Send several frames concatenated into a single stdout write. */
function sendFramesCoalesced(msgs: Frame[]): void {
  process.stdout.write(Buffer.concat(msgs.map(toBuffer)));
}

/** Write a frame whose declared length is absurdly large — a framing violation. */
function sendBadLengthPrefix(): void {
  const header = Buffer.alloc(4);
  header.writeUInt32BE(0xffffffff, 0);
  process.stdout.write(Buffer.concat([header, Buffer.from("not-a-real-frame")]));
}

function discoverReply(requestId: string): Frame {
  return {
    type: "discover",
    request_id: requestId,
    data: {
      nodes: [
        {
          node_type: nodeType,
          title: "Fake Test Node",
          description: "A fake node for stdio bridge tests",
          properties: [],
          outputs: [{ name: "out", type: { type: "string" } }],
          required_settings: []
        }
      ],
      protocol_version: 1,
      load_errors: []
    }
  };
}

function handle(msg: Frame): void {
  const type = msg.type as string;
  const requestId = msg.request_id as string;

  if (exitOnType && type === exitOnType) {
    // Mid-request exit: the worker vanishes without ever answering.
    process.exit(1);
  }

  if (ignoreType && type === ignoreType) {
    // Silently drop — the request stays pending forever.
    return;
  }

  if (badLengthOnType && type === badLengthOnType) {
    sendBadLengthPrefix();
    return;
  }

  switch (type) {
    case "discover": {
      const reply = discoverReply(requestId);
      if (coalesceFiller) {
        sendFramesCoalesced([
          reply,
          // Harmless filler frame with no matching pending request — exercises
          // "two frames arrive in a single stdout chunk" without depending on
          // the client having a second request already in flight.
          { type: "progress", request_id: "no-such-request", data: { progress: 0, total: 1 } }
        ]);
      } else {
        sendFrame(reply);
      }
      break;
    }
    case "worker.status":
      sendFrame({
        type: "result",
        request_id: requestId,
        data: {
          transport: "stdio",
          protocol_version: 1,
          node_count: 1,
          provider_count: 0,
          namespaces: ["fake"],
          load_errors: [],
          max_frame_size: 256 * 1024 * 1024
        }
      });
      break;
    case "execute": {
      const data = msg.data as { fields?: Record<string, unknown> };
      sendFrame({
        type: "result",
        request_id: requestId,
        data: {
          outputs: { out: (data.fields?.value as string) ?? "executed" },
          blobs: {}
        }
      });
      break;
    }
    case "cancel":
      break;
    default:
      break;
  }
}

function start(): void {
  const decoder = new FrameDecoder();
  process.stdin.on("data", (chunk: Buffer) => {
    let frames: Buffer[];
    try {
      frames = decoder.push(chunk);
    } catch {
      process.exit(1);
      return;
    }
    for (const payload of frames) {
      let msg: Frame;
      try {
        msg = unpack(payload) as Frame;
      } catch {
        continue;
      }
      handle(msg);
    }
  });
}

if (mode === "never-ready") {
  // Never signal readiness; keep the process alive so the bridge's
  // startup-timeout path (not a spawn failure) is what fires.
  setInterval(() => {}, 1 << 30);
} else {
  setTimeout(() => {
    process.stderr.write("NODETOOL_STDIO_READY\n");
    start();
  }, readyDelayMs);
}
