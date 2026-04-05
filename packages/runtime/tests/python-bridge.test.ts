import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PythonBridge } from "../src/python-bridge.js";
import { WebSocketServer } from "ws";
import * as msgpack from "@msgpack/msgpack";

// Mock Python server for testing
function createMockServer(port: number): {
  wss: WebSocketServer;
  close: () => void;
} {
  const wss = new WebSocketServer({ port });
  wss.on("connection", (ws) => {
    ws.on("message", (data: Buffer) => {
      const msg = msgpack.decode(data) as Record<string, unknown>;
      const type = msg.type as string;
      const requestId = msg.request_id as string;

      if (type === "discover") {
        const response = msgpack.encode({
          type: "discover",
          request_id: requestId,
          data: {
            nodes: [
              {
                node_type: "test.EchoNode",
                title: "Echo",
                description: "Echoes input",
                properties: [{ name: "text", type: { type: "str" } }],
                outputs: [{ name: "output", type: { type: "str" } }],
                required_settings: []
              }
            ]
          }
        });
        ws.send(response);
      } else if (type === "execute") {
        const execData = msg.data as Record<string, unknown>;
        const fields = execData.fields as Record<string, unknown>;
        const response = msgpack.encode({
          type: "result",
          request_id: requestId,
          data: {
            outputs: { output: fields.text ?? "default" },
            blobs: {}
          }
        });
        ws.send(response);
      }
    });
  });
  return { wss, close: () => wss.close() };
}

describe("PythonBridge", () => {
  let mockServer: ReturnType<typeof createMockServer>;
  const PORT = 19876;

  beforeAll(() => {
    mockServer = createMockServer(PORT);
  });

  afterAll(() => {
    mockServer.close();
  });

  it("connects and discovers nodes", async () => {
    const bridge = new PythonBridge({ wsUrl: `ws://127.0.0.1:${PORT}` });
    await bridge.connect();
    const nodes = bridge.getNodeMetadata();
    expect(nodes.length).toBe(1);
    expect(nodes[0].node_type).toBe("test.EchoNode");
    bridge.close();
  });

  it("executes a node and returns result", async () => {
    const bridge = new PythonBridge({ wsUrl: `ws://127.0.0.1:${PORT}` });
    await bridge.connect();
    const result = await bridge.execute(
      "test.EchoNode",
      { text: "hello" },
      {},
      {}
    );
    expect(result.outputs.output).toBe("hello");
    bridge.close();
  });
});
