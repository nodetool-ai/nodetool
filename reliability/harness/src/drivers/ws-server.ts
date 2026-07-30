/**
 * WS-server driver (§12) — starts the hermetic test backend
 * (`createTestUiServer`, the helper `packages/websocket/src/e2e-server.ts`
 * and the websocket test suite both build on) and drives it with a real
 * msgpack `ws` client, exactly the wire protocol a real client speaks. Never
 * constructs `ExecutionSession`/`WorkflowRunner` directly — the kernel
 * driver (`kernel.ts`) is the only place allowed to do that (§12: "kernel
 * surface is the oracle").
 *
 * Records both directions: outbound command envelopes as
 * `client_to_server` frames, every inbound `ProcessingMessage` as
 * `server_to_client` — the ws-server driver is the one surface where that
 * distinction is real (the kernel driver has no wire).
 */
import { WebSocket } from "ws";
import {
  createTestUiServer,
  packWebSocketMessage,
  unpackWebSocketMessage
} from "@nodetool-ai/websocket";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import { registerBaseNodes } from "@nodetool-ai/base-nodes";
import {
  resolvePythonNodeExecutor,
  type PythonBridgeBase
} from "@nodetool-ai/runtime";
import type { Journey, JourneyInteraction } from "../core/journey.js";
import { makeFrame, type RunFrame, type RunRecord } from "../core/record.js";
import { AnchorWaiter } from "./anchors.js";
import { registerFixtureNodes } from "./fixture-nodes.js";
import { journeyPythonBridgeFactory } from "./python-bridge.js";
import type { RunDriver } from "./types.js";
import { maybeFrontWithProxy, type WsProxyFrontEnd } from "../faults/ws-proxy.js";

const TERMINAL_JOB_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
  "suspended"
]);

/**
 * Message `type`s the ws-server relay backfills `job_id`/`workflow_id` onto
 * uniformly (its "outbound spread") that the kernel's own emissions for
 * these types (`runner.ts`/`actor.ts`) never carry at all. Scoped per-type
 * (not a blanket drop) because `job_update` DOES set both, and `edge_update`
 * DOES set `job_id`, on the raw kernel stream too — dropping either there
 * would hide a real regression instead of a harmless relay addition. Kept as
 * a driver-local rule (not a `normalize.ts` field list) because
 * `normalize.ts`'s generic per-key visitor has other callers — including its
 * own unit tests — that legitimately expect `job_id`/`workflow_id`
 * preserved on a `node_update`. This driver is the one place that actually
 * knows which of these are relay-only enrichment on ITS wire protocol.
 */
const RELAY_ONLY_JOB_ID_TYPES = new Set([
  "node_update",
  "generation_complete",
  "output_update",
  // `llm_call` (task D1, journey 8 — the first journey to run a real LLM
  // node): the relay backfills `job_id`/`workflow_id` here the same way it
  // does for `node_update`; the kernel's own `llm_call` emission
  // (`BaseProvider`'s tracing helper) never carries either.
  "llm_call"
]);
const RELAY_ONLY_WORKFLOW_ID_TYPES = new Set([
  "node_update",
  "generation_complete",
  "output_update",
  "edge_update",
  "llm_call"
]);

/** Strips fields this driver's relay adds that the kernel driver's raw
 * stream never has, so the two are comparable frame-for-frame (see
 * {@link RELAY_ONLY_JOB_ID_TYPES}/{@link RELAY_ONLY_WORKFLOW_ID_TYPES}).
 * `generation_complete.index` is the same kind of addition — an
 * arrival-order stamp (`unified-websocket-runner.ts`'s
 * `generationIndexByNode`) the kernel's own `generation_complete` emission
 * never sets. */
function stripRelayOnlyFields(message: Record<string, unknown>): Record<string, unknown> {
  const type = String(message["type"]);
  const rest = { ...message };
  if (RELAY_ONLY_JOB_ID_TYPES.has(type)) delete rest["job_id"];
  if (RELAY_ONLY_WORKFLOW_ID_TYPES.has(type)) delete rest["workflow_id"];
  if (type === "generation_complete") delete rest["index"];
  return rest;
}

function requireJobId(jobId: string | null, journeyName: string, action: string): string {
  if (!jobId) {
    throw new Error(
      `journey "${journeyName}": "${action}" interaction fired before a job_id was observed`
    );
  }
  return jobId;
}

export class WsServerDriver implements RunDriver {
  readonly name = "ws-server";

  async run(journey: Journey): Promise<RunRecord> {
    // Task D3: mirror the kernel driver's Python-bridge wiring
    // (`python-bridge.ts`) so journey 7 (`python-node-workflow`) behaves the
    // same on both surfaces. `createTestUiServer`'s default `resolveExecutor`
    // only ever calls `registry.resolve` — unlike `ExecutionSession`, it has
    // no built-in bridge fallback — so this driver builds one itself: a
    // throwaway registry (same real base nodes + harness fixtures the actual
    // server registry ends up with, via `configureRegistry` below) just to
    // answer "can the TS registry resolve this type", exactly the predicate
    // `connectPythonBridgeForGraph` needs. A graph with no unresolved node
    // type (every journey but #7) never spawns anything.
    const bridgeCheckRegistry = new NodeRegistry();
    registerBaseNodes(bridgeCheckRegistry);
    registerFixtureNodes(bridgeCheckRegistry);
    const workflowNodes = ((journey.workflow as { nodes?: unknown }).nodes ??
      []) as ReadonlyArray<{ type?: unknown }>;
    const bridge: PythonBridgeBase | null = await journeyPythonBridgeFactory(
      workflowNodes,
      (t: string) => bridgeCheckRegistry.has(t)
    );

    let liveRegistry: NodeRegistry | null = null;
    const srv = createTestUiServer({
      host: "127.0.0.1",
      port: 0,
      configureRegistry: (registry) => {
        registerFixtureNodes(registry);
        liveRegistry = registry;
      },
      resolveExecutor: (node) => {
        const registry = liveRegistry;
        if (registry?.has(node.type)) return registry.resolve(node);
        const pythonExecutor = resolvePythonNodeExecutor(bridge, node);
        if (pythonExecutor) return pythonExecutor;
        // Falls through to the registry's own "Unknown node type" error —
        // same failure shape a bridge-less run would produce.
        return registry!.resolve(node);
      },
      // Without this, `Graph.loadFromDict` (node-sdk) silently drops a
      // bridge-only node type (and its edges) during hydration — it never
      // even reaches `resolveExecutor` above, so a bridge CONNECT failure
      // (never-ready/epipe/version-mismatch: `bridge` ends up `null`) would
      // otherwise make the node vanish from the graph entirely instead of
      // failing at execution the way the kernel driver's
      // `hydrateGraphNodeFlags` does (it defaults metadata for ANY
      // class-less node rather than dropping it — see that function's own
      // doc comment). Mirrors that: bridge metadata when connected, a
      // generic pass-through shape when not, so either way the node stays in
      // the graph and the real failure surfaces later, at
      // `resolveExecutor`/`execute()` — the same failure shape on both
      // surfaces, just like the kernel driver.
      resolveUnknownNodeType: async (nodeType) => {
        const meta = bridge?.hasNodeType(nodeType)
          ? bridge.getNodeMetadata().find((m) => m.node_type === nodeType)
          : undefined;
        if (meta) {
          return {
            nodeType,
            propertyTypes: Object.fromEntries(
              meta.properties.map((p) => [p.name, p.type.type])
            ),
            outputs: Object.fromEntries(
              meta.outputs.map((o) => [o.name, o.type.type])
            ),
            supportsDynamicInputs: false,
            descriptorDefaults: {}
          };
        }
        return {
          nodeType,
          propertyTypes: { value: "any" },
          outputs: { out: "any" },
          supportsDynamicInputs: true,
          descriptorDefaults: {}
        };
      }
    });
    await srv.listen();
    const address = srv.server.address();
    const serverPort = typeof address === "object" && address !== null ? address.port : 7777;

    // Task D2: when a ws-* fault (`faults/ws-faults.ts`) is currently active,
    // front the real server with a `WsFaultProxy` and connect this driver's
    // client to the proxy instead — every ws-* fault applies transparently
    // to this one client-connection code path below. `wsFrontEnd` stays
    // `null` (the overwhelming majority of runs) when no ws fault is
    // configured, in which case this is exactly the pre-D2 direct connection.
    const wsFrontEnd: WsProxyFrontEnd | null = await maybeFrontWithProxy(
      "127.0.0.1",
      serverPort
    );
    const port = wsFrontEnd ? wsFrontEnd.port : serverPort;

    const frames: RunFrame[] = [];
    let seq = 0;
    const waiter = new AnchorWaiter();
    let jobId: string | null = null;
    let terminalStatus: string | null = null;
    let terminalError: string | null = null;
    // ws-server relays two `job_update`s per status the kernel driver only
    // ever sees once: an eager "running" ack sent before the kernel's own
    // relayed `job_update running` ("Authoritative SDK runs can use [the
    // kernel's] update and avoid an otherwise duplicate WebSocket frame.
    // Legacy clients keep the eager acknowledgement" —
    // `unified-websocket-runner.ts`), and, for any non-"completed" terminal
    // status, an "authoritative terminal snapshot" appended after the
    // relayed one because the kernel's own terminal frame never carries a
    // `result` field. Recording only the first `job_update` this driver
    // sees per status makes frame counts comparable to the kernel driver's
    // single emission per status — the second is this wire protocol's own
    // client-convenience redundancy, not new information.
    const seenJobUpdateStatuses = new Set<string>();
    let resolveTerminal!: () => void;
    const terminalPromise = new Promise<void>((resolve) => {
      resolveTerminal = resolve;
    });

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    ws.on("message", (data: Buffer, isBinary: boolean) => {
      const raw = (
        isBinary
          ? unpackWebSocketMessage(data)
          : JSON.parse(data.toString("utf8"))
      ) as Record<string, unknown>;
      const message = stripRelayOnlyFields(raw);
      waiter.notify(message);
      if (typeof message["job_id"] === "string") {
        jobId = message["job_id"] as string;
      }

      // Command acks (`{message: "Job started", ...}` for run_job/cancel_job/
      // stream_input/end_input_stream) carry no `type` at all — they are not
      // `ProcessingMessage`s, just a reply to the command envelope this
      // driver already recorded as its own `client_to_server` frame. Not
      // recording them keeps this surface's `server_to_client` frames
      // apples-to-apples with the kernel driver's raw message stream.
      if (typeof message["type"] !== "string") return;

      if (message["type"] === "job_update") {
        const status = String(message["status"]);
        if (seenJobUpdateStatuses.has(status)) return;
        seenJobUpdateStatuses.add(status);
        if (TERMINAL_JOB_STATUSES.has(status)) {
          terminalStatus = status;
          terminalError =
            typeof message["error"] === "string" ? (message["error"] as string) : null;
          frames.push(makeFrame(seq++, "ws-server", "server_to_client", message));
          resolveTerminal();
          return;
        }
      }

      frames.push(makeFrame(seq++, "ws-server", "server_to_client", message));
    });

    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });

    const send = (command: string, data: Record<string, unknown>): void => {
      const envelope = { command, data };
      frames.push(makeFrame(seq++, "ws-server", "client_to_server", envelope));
      ws.send(packWebSocketMessage(envelope));
    };

    try {
      const interactions: JourneyInteraction[] =
        journey.interactions.length > 0 ? journey.interactions : [{ action: "run" }];

      for (const interaction of interactions) {
        if (interaction.at) {
          // Same race-free ordering rule as the kernel driver (anchors.ts):
          // no `await` happens between a "run"'s `send()` and this wait, so
          // the waiter is registered before the ws `message` handler (which
          // runs on Node's event loop, not inline) can deliver the frame.
          await waiter.wait(interaction.at);
        }

        switch (interaction.action) {
          case "run":
            send("run_job", {
              graph: journey.workflow,
              workflow_id: journey.manifest.name,
              params: journey.manifest.params,
              // Hermetic and driver-symmetric: the kernel driver never
              // touches the jobs DB either, so neither surface depends on
              // persistence to complete a journey. Deliberately NOT
              // `require_terminal_result` — that also renames Output nodes'
              // terminal keys to their public `properties.name`
              // (`rewriteOutputNames`), which the kernel driver doesn't do
              // either; every journey's `Output` nodes already carry an
              // explicit top-level `name` so both surfaces agree without it.
              execution_options: { persistence: "session" }
            });
            break;
          case "cancel":
            send("cancel_job", {
              job_id: requireJobId(jobId, journey.manifest.name, "cancel")
            });
            break;
          case "stream_input":
            if (!interaction.nodeId) {
              throw new Error(
                `journey "${journey.manifest.name}": "stream_input" interaction needs nodeId`
              );
            }
            send("stream_input", {
              job_id: requireJobId(jobId, journey.manifest.name, "stream_input"),
              input: interaction.nodeId,
              value: interaction.value
            });
            break;
          case "end_input_stream":
            if (!interaction.nodeId) {
              throw new Error(
                `journey "${journey.manifest.name}": "end_input_stream" interaction needs nodeId`
              );
            }
            send("end_input_stream", {
              job_id: requireJobId(jobId, journey.manifest.name, "end_input_stream"),
              input: interaction.nodeId
            });
            break;
          case "reconnect":
            throw new Error(
              `journey "${journey.manifest.name}": ws-server driver does not yet ` +
                `support the "reconnect" interaction (C4)`
            );
        }
      }

      // Task D2: a black-hole-style ws fault (`ws-drop-no-fin`,
      // `ws-stall-reads`) can leave `terminalPromise` unresolved forever —
      // the whole point of those faults is that no more frames arrive. §9's
      // "no run hangs forever" applies to fault runs too, so race the wait
      // against the journey's own declared timeout instead of adding one
      // only for the happy path.
      let timedOut = false;
      let timeoutTimer: NodeJS.Timeout | undefined;
      await Promise.race([
        terminalPromise,
        new Promise<void>((resolve) => {
          timeoutTimer = setTimeout(() => {
            timedOut = true;
            resolve();
          }, journey.manifest.timeoutMs);
        })
      ]);
      clearTimeout(timeoutTimer);
      if (timedOut && terminalStatus === null) {
        terminalStatus = "timeout";
        terminalError =
          `journey "${journey.manifest.name}": ws-server driver timed out after ` +
          `${journey.manifest.timeoutMs}ms waiting for a terminal job_update`;
      }
    } finally {
      ws.close();
      await wsFrontEnd?.close();
      await srv.close();
      bridge?.close();
    }

    return {
      journeyId: journey.manifest.name,
      surface: this.name,
      jobId,
      workflowId: journey.manifest.name,
      startedAt: frames.length > 0 ? frames[0].ts : null,
      finishedAt: frames.length > 0 ? frames[frames.length - 1].ts : null,
      durationMs: null,
      status: terminalStatus ?? "unknown",
      error: terminalError,
      params: journey.manifest.params,
      frames
    };
  }
}
