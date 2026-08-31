import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  sdkV1ExecutionCommand,
  sdkV1ExecutionEvent
} from "../../protocol/src/api-schemas/sdk-execution-v1.js";
import { sdkV1WebSocketOperations } from "../../protocol/src/api-schemas/sdk-v1-websocket-operations.js";
import { processingMessageSchemas } from "../../protocol/src/messages.js";
import { outboundControlMessageSchemas } from "../../protocol/src/ws-commands.js";
import {
  packWebSocketMessage,
  unpackWebSocketMessage
} from "../src/messagepack.js";

interface ExecutionWireFrame {
  direction: "client" | "server";
  message: unknown;
  messagepack_hex: string;
  name: string;
}

interface ExecutionWireFixture {
  encoding: "messagepack";
  fixture_version: number;
  frames: ExecutionWireFrame[];
}

const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../protocol/fixtures/sdk-v1/execution-wire.json",
      import.meta.url
    ),
    "utf8"
  )
) as ExecutionWireFixture;

const declaredExecutionCommands = sdkV1WebSocketOperations
  .filter(
    (operation) =>
      operation.feature === "execution" &&
      operation.direction === "client-command" &&
      operation.status === "implemented"
  )
  .map((operation) => operation.command)
  .sort();

const runnerSource = readFileSync(
  new URL("../src/websocket-client-session.ts", import.meta.url),
  "utf8"
);
const commandRouterSource = readFileSync(
  new URL("../src/session/commands.ts", import.meta.url),
  "utf8"
);
const websocketPluginSource = readFileSync(
  new URL("../src/plugins/websocket.ts", import.meta.url),
  "utf8"
);

describe("SDK v1 execution contract", () => {
  it("freezes every C# SDK execution command and representative server event", () => {
    expect(fixture.fixture_version).toBe(1);
    expect(fixture.encoding).toBe("messagepack");

    for (const frame of fixture.frames) {
      const bytes = Buffer.from(frame.messagepack_hex, "hex");
      expect(unpackWebSocketMessage(bytes), frame.name).toEqual(frame.message);
      expect(
        packWebSocketMessage(frame.message).toString("hex"),
        frame.name
      ).toBe(frame.messagepack_hex);

      const schema =
        frame.direction === "client"
          ? sdkV1ExecutionCommand
          : sdkV1ExecutionEvent;
      const parsed = schema.safeParse(frame.message);
      expect(
        parsed.success,
        `${frame.name}: ${parsed.success ? "" : parsed.error.message}`
      ).toBe(true);
    }
  });

  it("keeps registry, goldens, and live runner command dispatch complete", () => {
    const goldenCommands = fixture.frames
      .filter((frame) => frame.direction === "client")
      .map((frame) => {
        const message = frame.message as { command?: unknown };
        return message.command;
      })
      .sort();

    expect(declaredExecutionCommands).toEqual([
      "cancel_job",
      "end_input_stream",
      "reconnect_job",
      "run_job",
      "stream_input",
      "update_node_properties"
    ]);
    expect(goldenCommands).toEqual(declaredExecutionCommands);
    for (const command of declaredExecutionCommands) {
      // The command dispatch is CommandRouter's table, one entry per command.
      const occurrences = commandRouterSource.match(
        new RegExp(`^ {4}${command}: `, "gm")
      );
      expect(occurrences, `${command}: live runner dispatch`).toHaveLength(1);
    }
  });

  it("covers target, replay, progress, terminal result, and rejection events", () => {
    const eventNames = fixture.frames
      .filter((frame) => frame.direction === "server")
      .map((frame) => frame.name);

    expect(eventNames).toEqual([
      "execution_target_event",
      "replay_header_event",
      "job_running_event",
      "node_update_event",
      "node_progress_event",
      "output_update_event",
      "chunk_event",
      "terminal_result_event",
      "protocol_rejection_event"
    ]);

    for (const type of [
      "job_update",
      "node_update",
      "node_progress",
      "output_update",
      "chunk"
    ] as const) {
      expect(processingMessageSchemas[type], `${type}: publisher schema`).toBeDefined();
    }
    expect(outboundControlMessageSchemas.job_resumed).toBeDefined();
    expect(websocketPluginSource).toContain('type: "sdk_execution_target"');
    for (const rejection of [
      "invalid_frame",
      "invalid_message",
      "invalid_command"
    ]) {
      expect(runnerSource, `${rejection}: live rejection publisher`).toContain(
        `error: "${rejection}"`
      );
    }
  });
});
