/**
 * Phase 0 golden replay for the six implemented SDK v1 WebSocket commands
 * (docs/sdk/sdk-trpc-consolidation.md § Phase 0): the four discovery
 * commands the runner serves through its in-process tRPC caller
 * (list_workflow_summaries, get_workflow_interface, get_workflow_interfaces,
 * get_node_type_inventory) and the two lifecycle commands served by
 * handleSdkV1LifecycleRpc (get_capabilities, preflight_workflow), plus two
 * feature-disabled error envelopes.
 *
 * Each fixture in packages/protocol/fixtures/sdk-v1/ws-*.json records the
 * request and response envelopes together with their exact MessagePack hex.
 * The replay drives the real UnifiedWebSocketRunner and asserts structured
 * equality AND byte equality of the emitted frame. Fixture request/response
 * key order is wire order — it must round-trip through packWebSocketMessage
 * to the recorded hex — so these fixtures are written without key sorting.
 *
 * Regenerate with NODETOOL_UPDATE_SDK_V1_GOLDENS=1, then rerun without the
 * flag and review the fixture diff before committing.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi
} from "vitest";
import { initTestDb } from "@nodetool-ai/models";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  packWebSocketMessage,
  unpackWebSocketMessage
} from "../src/messagepack.js";
import {
  UnifiedWebSocketRunner,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/unified-websocket-runner.js";
import {
  FROZEN_NOW,
  GOLDEN_BASE_ENV,
  GOLDEN_PREFLIGHT_REQUEST,
  GOLDEN_USER,
  MISSING_WORKFLOW_ID,
  UPDATE_GOLDENS,
  WORKFLOW_ONE_ID,
  makeGoldenApiOptions,
  makeGoldenRegistry,
  readFixture,
  seedGoldenWorkflows,
  writeFixture
} from "./sdk-v1-golden-harness.js";

class MockWebSocket implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  readonly sentBytes: Uint8Array[] = [];
  readonly sentText: string[] = [];
  readonly queue: WebSocketReceiveFrame[] = [];

  async accept(): Promise<void> {
    return;
  }

  async receive(): Promise<WebSocketReceiveFrame> {
    return this.queue.shift() ?? { type: "websocket.disconnect" };
  }

  async sendBytes(data: Uint8Array): Promise<void> {
    this.sentBytes.push(data);
  }

  async sendText(data: string): Promise<void> {
    this.sentText.push(data);
  }

  async close(): Promise<void> {
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
  }
}

interface WsGoldenSpec {
  fixture: string;
  command: string;
  /** Overrides applied on top of {@link GOLDEN_BASE_ENV}. */
  env: Record<string, string>;
  request: Record<string, unknown>;
}

interface WsGoldenFixture {
  fixture_version: number;
  command: string;
  env: Record<string, string>;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  messagepack_request_hex: string;
  messagepack_response_hex: string;
}

function wsRequest(
  command: string,
  data: Record<string, unknown>
): Record<string, unknown> {
  return {
    command,
    request_id: `sdk-golden-${command}`,
    data
  };
}

const WS_GOLDENS: WsGoldenSpec[] = [
  {
    fixture: "ws-list-workflow-summaries.json",
    command: "list_workflow_summaries",
    env: {},
    request: wsRequest("list_workflow_summaries", { limit: 50 })
  },
  {
    fixture: "ws-get-workflow-interface.json",
    command: "get_workflow_interface",
    env: {},
    request: wsRequest("get_workflow_interface", {
      id: WORKFLOW_ONE_ID,
      version: 1
    })
  },
  {
    fixture: "ws-get-workflow-interfaces.json",
    command: "get_workflow_interfaces",
    env: {},
    request: wsRequest("get_workflow_interfaces", {
      ids: [WORKFLOW_ONE_ID, MISSING_WORKFLOW_ID],
      version: 1
    })
  },
  {
    fixture: "ws-get-node-type-inventory.json",
    command: "get_node_type_inventory",
    env: {},
    request: wsRequest("get_node_type_inventory", { limit: 50 })
  },
  {
    fixture: "ws-get-capabilities.json",
    command: "get_capabilities",
    env: {},
    request: wsRequest("get_capabilities", {})
  },
  {
    fixture: "ws-preflight-workflow.json",
    command: "preflight_workflow",
    env: {},
    request: wsRequest("preflight_workflow", { ...GOLDEN_PREFLIGHT_REQUEST })
  },
  {
    // Error envelope from handleSdkV1LifecycleRpc's own kill-switch check.
    fixture: "ws-get-capabilities-disabled.json",
    command: "get_capabilities",
    env: { NODETOOL_DISABLE_SDK_LIFECYCLE_V1: "1" },
    request: wsRequest("get_capabilities", {})
  },
  {
    // Error envelope from the runner's runRpc tRPC error mapping.
    fixture: "ws-get-workflow-interface-disabled.json",
    command: "get_workflow_interface",
    env: { NODETOOL_DISABLE_SDK_WORKFLOW_INTERFACE_V1: "1" },
    request: wsRequest("get_workflow_interface", {
      id: WORKFLOW_ONE_ID,
      version: 1
    })
  }
];

describe("SDK v1 WebSocket goldens", () => {
  let registry: NodeRegistry;

  beforeAll(async () => {
    vi.useFakeTimers({ now: new Date(FROZEN_NOW), toFake: ["Date"] });
    for (const [key, value] of Object.entries(GOLDEN_BASE_ENV)) {
      vi.stubEnv(key, value);
    }
    initTestDb();
    await seedGoldenWorkflows();
    registry = makeGoldenRegistry();
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const [key, value] of Object.entries(GOLDEN_BASE_ENV)) {
      vi.stubEnv(key, value);
    }
  });

  /** Drives one command through the real runner; returns the emitted frame. */
  async function execute(spec: WsGoldenSpec): Promise<Uint8Array> {
    for (const [key, value] of Object.entries(spec.env)) {
      vi.stubEnv(key, value);
    }
    const socket = new MockWebSocket();
    const runner = new UnifiedWebSocketRunner({
      userId: GOLDEN_USER,
      resolveExecutor: () =>
        ({
          async process() {
            return {};
          }
        }) as never,
      nodeRegistry: registry,
      apiOptions: makeGoldenApiOptions(registry),
      pythonBridge: {} as never,
      getPythonBridgeReady: () => true
    });
    await runner.connect(socket, GOLDEN_USER);
    socket.queue.push({
      type: "websocket.message",
      text: JSON.stringify(spec.request)
    });
    socket.queue.push({ type: "websocket.disconnect" });
    try {
      await runner.receiveMessages();
      const bytes = socket.sentBytes[0];
      expect(bytes, `${spec.fixture}: runner emitted no binary frame`).toBeDefined();
      return bytes;
    } finally {
      await runner.disconnect();
      for (const key of Object.keys(spec.env)) {
        vi.stubEnv(key, GOLDEN_BASE_ENV[key] ?? "0");
      }
    }
  }

  for (const spec of WS_GOLDENS) {
    it(`replays ${spec.fixture}`, async () => {
      if (UPDATE_GOLDENS) {
        const bytes = await execute(spec);
        const recorded: WsGoldenFixture = {
          fixture_version: 1,
          command: spec.command,
          env: { ...GOLDEN_BASE_ENV, ...spec.env },
          request: spec.request,
          response: unpackWebSocketMessage(bytes),
          messagepack_request_hex: Buffer.from(
            packWebSocketMessage(spec.request)
          ).toString("hex"),
          messagepack_response_hex: Buffer.from(bytes).toString("hex")
        };
        // Wire order must survive: no key sorting for WS fixtures.
        writeFixture(spec.fixture, recorded, { sortKeys: false });
      }

      const fixture = readFixture(spec.fixture) as WsGoldenFixture;
      expect(fixture.fixture_version).toBe(1);
      expect(fixture.command).toBe(spec.command);
      expect(fixture.request).toEqual(spec.request);

      // The recorded request/response encode to exactly the recorded bytes …
      expect(
        Buffer.from(packWebSocketMessage(fixture.request)).toString("hex")
      ).toBe(fixture.messagepack_request_hex);
      expect(
        Buffer.from(packWebSocketMessage(fixture.response)).toString("hex")
      ).toBe(fixture.messagepack_response_hex);
      // … and the recorded bytes decode back to the recorded envelopes.
      expect(
        unpackWebSocketMessage(
          Buffer.from(fixture.messagepack_request_hex, "hex")
        )
      ).toEqual(fixture.request);
      expect(
        unpackWebSocketMessage(
          Buffer.from(fixture.messagepack_response_hex, "hex")
        )
      ).toEqual(fixture.response);

      // The live runner still emits the same frame, byte for byte.
      const bytes = await execute(spec);
      expect(unpackWebSocketMessage(bytes)).toEqual(fixture.response);
      expect(Buffer.from(bytes).toString("hex")).toBe(
        fixture.messagepack_response_hex
      );
    });
  }
});
