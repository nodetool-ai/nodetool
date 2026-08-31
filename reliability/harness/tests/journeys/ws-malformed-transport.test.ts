/**
 * Journey #14's transport half (docs/RELIABILITY_ARCHITECTURE.md §5 item 14,
 * §9; task D2 step 4). `packages/websocket/tests/websocket-client-session-
 * malformed-protocol.test.ts` (Track B task B2) already covers the
 * application-layer corpus (wrong field type, unknown `type`) against a
 * mocked `WebSocketConnection` — no real socket, no proxy. This is the
 * transport-level extension: the same "near-valid frame" idea, sent as real
 * bytes through a real `WsFaultProxy` (task D2's `faults/net-proxy.ts`)
 * against the real hermetic server, for the two failure modes that need an
 * actual byte-level frame to exist at all — oversized (past
 * `NODETOOL_WS_MAX_MESSAGE_BYTES`) and truncated (undecodable) msgpack — plus
 * the proxy's own `fragment` fault layered on top, proving frame-splitting
 * at the TCP level doesn't change the outcome.
 *
 * Each bad frame must get a structured `invalid_frame` rejection without the
 * connection dying or the job table corrupting: `unified-websocket-
 * runner.ts`'s `receiveMessages()` loop is documented to reject-and-continue
 * on a decode failure (see its own comment at the catch block), so the
 * strongest proof available here is that the *same* connection goes on to
 * run a real workflow to completion right after sending the bad frame.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import {
  createTestUiServer,
  packWebSocketMessage,
  unpackWebSocketMessage
} from "@nodetool-ai/websocket";
import { resetEnvironment } from "@nodetool-ai/config";
import { WsFaultProxy } from "../../src/faults/net-proxy.js";

const MAX_BYTES_ENV = "NODETOOL_WS_MAX_MESSAGE_BYTES";

const WORKFLOW = {
  id: "ws-malformed-transport",
  name: "WS malformed transport",
  nodes: [
    {
      id: "const1",
      type: "nodetool.constant.String",
      name: "const1",
      properties: { value: "hello reliability" }
    },
    {
      id: "upper1",
      type: "nodetool.text.ToUppercase",
      name: "upper1",
      properties: {}
    },
    {
      id: "out1",
      type: "nodetool.output.Output",
      name: "out1",
      properties: { name: "result" }
    }
  ],
  edges: [
    {
      id: "e1",
      source: "const1",
      sourceHandle: "output",
      target: "upper1",
      targetHandle: "text"
    },
    {
      id: "e2",
      source: "upper1",
      sourceHandle: "output",
      target: "out1",
      targetHandle: "value"
    }
  ]
};

interface OpenSocket {
  ws: WebSocket;
  messages: Record<string, unknown>[];
}

async function connect(port: number): Promise<OpenSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const messages: Record<string, unknown>[] = [];
  ws.on("message", (data: Buffer, isBinary: boolean) => {
    const message = (
      isBinary ? unpackWebSocketMessage(data) : JSON.parse(data.toString("utf8"))
    ) as Record<string, unknown>;
    messages.push(message);
  });
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  return { ws, messages };
}

function waitFor(
  socket: OpenSocket,
  predicate: (m: Record<string, unknown>) => boolean,
  timeoutMs = 10000
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const poll = (): void => {
      const found = socket.messages.find(predicate);
      if (found) {
        resolve(found);
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error(`timed out waiting for a matching message; got: ${JSON.stringify(socket.messages)}`));
        return;
      }
      setTimeout(poll, 20);
    };
    poll();
  });
}

async function runToCompletion(socket: OpenSocket): Promise<void> {
  const before = socket.messages.length;
  socket.ws.send(
    packWebSocketMessage({
      command: "run_job",
      data: {
        graph: WORKFLOW,
        workflow_id: WORKFLOW.id,
        params: {},
        execution_options: { persistence: "session" }
      }
    })
  );
  const terminal = await waitFor(
    socket,
    (m) =>
      socket.messages.indexOf(m) >= before &&
      m["type"] === "job_update" &&
      typeof m["status"] === "string" &&
      ["completed", "failed", "cancelled"].includes(m["status"] as string)
  );
  expect(terminal["status"]).toBe("completed");
}

describe("journey 14 (transport half): malformed frames through the proxy (task D2)", () => {
  let srv: ReturnType<typeof createTestUiServer>;
  let proxy: WsFaultProxy;
  let proxyPort: number;

  beforeEach(async () => {
    resetEnvironment();
    process.env[MAX_BYTES_ENV] = "4096";
    srv = createTestUiServer({ host: "127.0.0.1", port: 0 });
    await srv.listen();
    const address = srv.server.address();
    const serverPort = typeof address === "object" && address !== null ? address.port : 0;
    proxy = new WsFaultProxy("127.0.0.1", serverPort, null);
    proxyPort = await proxy.listen();
  });

  afterEach(async () => {
    await proxy.close();
    await srv.close();
    delete process.env[MAX_BYTES_ENV];
    resetEnvironment();
  });

  it(
    "an oversized frame gets rejected without killing the connection; the same connection then completes a real run",
    { timeout: 20000 },
    async () => {
      const socket = await connect(proxyPort);
      // A well-formed WS binary frame (the `ws` library handles the framing)
      // whose payload alone exceeds the 4096-byte cap set above.
      socket.ws.send(Buffer.alloc(8192, 0x41));
      await waitFor(socket, (m) => m["error"] === "invalid_frame");
      await runToCompletion(socket);
      socket.ws.close();
    }
  );

  it(
    "truncated (undecodable) msgpack gets rejected without killing the connection; the same connection then completes a real run",
    { timeout: 20000 },
    async () => {
      const socket = await connect(proxyPort);
      // The first few bytes of a msgpack-encoded object, with the rest
      // chopped off — not valid msgpack on its own.
      const valid = packWebSocketMessage({ command: "run_job", data: { graph: WORKFLOW } });
      socket.ws.send(valid.subarray(0, Math.max(1, Math.floor(valid.length / 3))));
      await waitFor(socket, (m) => m["error"] === "invalid_frame");
      await runToCompletion(socket);
      socket.ws.close();
    }
  );

  it(
    "fragmenting a well-formed run_job command across many small TCP writes still runs the workflow to completion",
    { timeout: 20000 },
    async () => {
      proxy.setFault({ kind: "fragment", chunkBytes: 2 });
      const socket = await connect(proxyPort);
      await runToCompletion(socket);
      socket.ws.close();
    }
  );
});
