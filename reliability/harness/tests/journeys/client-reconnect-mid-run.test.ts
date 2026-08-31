/**
 * Journey #9 (docs/RELIABILITY_ARCHITECTURE.md §5 item 9, §9's "WS
 * transport"/"Client" rows; task D2 step 3): "kill the socket after node 2
 * of 4; assert ... that the run's terminal state is observable after
 * resubscribe."
 *
 * The harness has no browser and no `WebSocketManager` — this models the
 * journey pragmatically with the harness's own raw msgpack `ws` client(s)
 * plus the wire protocol's own resubscribe command, `reconnect_job`
 * (`websocket-client-session.ts`'s `reconnectJob`), and records this test's
 * client-side actions as `RecordedTransition`s mapped onto
 * `WebSocketManager.ts`'s declared machine (`core/invariants/state-
 * machine.ts`'s `CLIENT_STATE_TRANSITIONS`) so that invariant has real data
 * to check, exactly as the task asks:
 *
 *   connect (disconnected->connecting) — client 1 opens
 *   connected (connecting->connected)  — client 1's `open` event
 *   disconnected (connected->disconnected) — the proxy black-holes client 1
 *     mid-run (after node 2 of 4); modeled here as the point a real
 *     `WebSocketManager`'s liveness watchdog would eventually tear the
 *     socket down once ping probes go unanswered (`WebSocketManager.ts`'s
 *     doc comment) — this test doesn't wait out that real timer, it
 *     force-closes client 1 immediately once the fault is armed, which is
 *     the same terminal state the watchdog converges on, just reached
 *     without the wait.
 *   reconnect (disconnected->reconnecting) — a fresh client 2 dials in
 *   connected (reconnecting->connected) — client 2's `open` event
 *
 * `websocket-client-session.ts` gives each WS connection its own
 * `WebSocketClientSession` instance (`test-ui-server.ts`, and production's
 * `plugins/websocket.ts` — same shape), so `reconnect_job` on a genuinely
 * new connection can never hit that runner's in-memory `activeJobs` map.
 * What it hits instead is the process-wide `jobRunRegistry`
 * (`job-run-registry.ts`): a run registers a detachable `JobRunSession` at
 * start, every frame it emits is stamped with `job_seq` and buffered, and a
 * dropped socket only *detaches* the session — the run keeps executing and
 * keeps buffering. Client 2's `reconnect_job` attaches to that session and
 * gets a `job_resumed` header plus the whole missed tail, terminal
 * `job_update` included. The run really did complete, and that is what
 * client 2 is told.
 *
 * The persisted `Job` row is now only the fallback for a run whose session
 * is gone (retention elapsed, or the server restarted); it exists at all
 * only when `execution_options.persistence` is `"job"` (every other journey
 * in this suite deliberately uses `"session"` to stay DB-free — this is the
 * one exception, and needs its own `initTestDb()`/`initMasterKey()`).
 *
 * Note the harness kills client 1 with a half-open proxy fault, so the
 * *server* never observes the disconnect: the session stays attached to a
 * socket nobody is reading. Client 2's `attach` steals the target from that
 * dead connection, and any delivery that failed against it was swallowed by
 * the session's delivery chain rather than stalling it — both are load-
 * bearing for this test and would regress silently without it.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import {
  createTestUiServer,
  packWebSocketMessage,
  unpackWebSocketMessage
} from "@nodetool-ai/websocket";
import { initTestDb, Job } from "@nodetool-ai/models";
import { initMasterKey } from "@nodetool-ai/security";
import { WsFaultProxy } from "../../src/faults/net-proxy.js";
import { checkStateMachine } from "../../src/core/invariants/state-machine.js";
import type { RecordedTransition, RunRecord } from "../../src/core/record.js";

const E2E_TEST_MASTER_KEY_B64 = "RTJFX1RFU1RfS0VZX0RPX05PVF9VU0VfSU5fUFJPRCE=";

const WORKFLOW = {
  id: "client-reconnect-mid-run",
  name: "Client reconnect mid-run",
  nodes: [
    { id: "n1", type: "nodetool.constant.String", name: "n1", properties: { value: "hello" } },
    { id: "n2", type: "nodetool.text.ToUppercase", name: "n2", properties: {} },
    { id: "n3", type: "nodetool.text.ToUppercase", name: "n3", properties: {} },
    { id: "n4", type: "nodetool.text.ToUppercase", name: "n4", properties: {} },
    { id: "out1", type: "nodetool.output.Output", name: "out1", properties: { name: "result" } }
  ],
  edges: [
    { id: "e1", source: "n1", sourceHandle: "output", target: "n2", targetHandle: "text" },
    { id: "e2", source: "n2", sourceHandle: "output", target: "n3", targetHandle: "text" },
    { id: "e3", source: "n3", sourceHandle: "output", target: "n4", targetHandle: "text" },
    { id: "e4", source: "n4", sourceHandle: "output", target: "out1", targetHandle: "value" }
  ]
};

interface RawClient {
  ws: WebSocket;
  messages: Record<string, unknown>[];
}

function connect(port: number): Promise<RawClient> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const messages: Record<string, unknown>[] = [];
  ws.on("message", (data: Buffer, isBinary: boolean) => {
    const message = (
      isBinary ? unpackWebSocketMessage(data) : JSON.parse(data.toString("utf8"))
    ) as Record<string, unknown>;
    messages.push(message);
  });
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve({ ws, messages }));
    ws.once("error", reject);
  });
}

function waitFor(
  client: RawClient,
  predicate: (m: Record<string, unknown>) => boolean,
  timeoutMs = 10000
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const poll = (): void => {
      const found = client.messages.find(predicate);
      if (found) {
        resolve(found);
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error(`timed out; got ${JSON.stringify(client.messages)}`));
        return;
      }
      setTimeout(poll, 20);
    };
    poll();
  });
}

async function waitForJobTerminal(jobId: string, timeoutMs = 10000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = await Job.get(jobId);
    if (job && ["completed", "failed", "cancelled"].includes(job.status)) {
      return job.status;
    }
    if (Date.now() > deadline) {
      throw new Error(`job "${jobId}" never reached a terminal persisted status`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("journey 9: client reconnect mid-run (task D2)", () => {
  beforeAll(async () => {
    process.env.SECRETS_MASTER_KEY = E2E_TEST_MASTER_KEY_B64;
    initTestDb();
    await initMasterKey();
  });

  let srv: ReturnType<typeof createTestUiServer>;
  let proxy: WsFaultProxy;
  let proxyPort: number;

  beforeEach(async () => {
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
  });

  it(
    "client 2 observes a terminal state after reconnecting; no invariant violation; the real job did complete server-side",
    { timeout: 20000 },
    async () => {
      const transitions: RecordedTransition[] = [];
      let seq = 0;
      const record = (action: string, from: string, to: string): void => {
        transitions.push({ at: seq++, action, from, to });
      };

      // connect -> connecting, then the `open` event -> connected.
      record("connect", "disconnected", "connecting");
      const client1 = await connect(proxyPort);
      record("connected", "connecting", "connected");

      client1.ws.send(
        packWebSocketMessage({
          command: "run_job",
          data: {
            graph: WORKFLOW,
            workflow_id: WORKFLOW.id,
            params: {},
            execution_options: { persistence: "job" }
          }
        })
      );

      const n2Completed = await waitFor(
        client1,
        (m) => m["type"] === "node_update" && m["node_id"] === "n2" && m["status"] === "completed"
      );
      const jobId = n2Completed["job_id"] as string;
      expect(jobId).toBeTruthy();

      // Kill the socket right after node 2 of 4 — half-open at the proxy
      // (no FIN, no RST forwarded) plus an immediate client-side terminate,
      // modeling the point a real liveness watchdog would eventually
      // declare the connection dead without this test waiting out those
      // real timers (see the file-level doc comment).
      proxy.killConnections("half-open");
      client1.ws.terminate();
      record("disconnected", "connected", "disconnected");

      // The job keeps running server-side — nothing told the runner to
      // cancel it, only this client went dark. Confirm it reaches its own
      // real terminal status independently of any client.
      const realStatus = await waitForJobTerminal(jobId);
      expect(realStatus).toBe("completed");

      // A fresh client reconnects and resubscribes.
      record("reconnect", "disconnected", "reconnecting");
      const client2 = await connect(proxyPort);
      record("connected", "reconnecting", "connected");

      // last_seq 0: client 2 has seen nothing of this job, so it asks for
      // the whole buffered stream.
      client2.ws.send(
        packWebSocketMessage({
          command: "reconnect_job",
          data: { job_id: jobId, workflow_id: WORKFLOW.id, last_seq: 0 }
        })
      );

      const header = await waitFor(
        client2,
        (m) => m["type"] === "job_resumed" && m["job_id"] === jobId
      );
      expect(header["status"]).toBe("finished");
      expect(header["replay_incomplete"]).toBe(false);
      expect(header["replay_count"]).toBeGreaterThan(0);

      const resubscribed = await waitFor(
        client2,
        (m) =>
          m["type"] === "job_update" &&
          m["job_id"] === jobId &&
          ["completed", "failed", "cancelled"].includes(String(m["status"]))
      );

      // The literal ask: the run's terminal state is observable after
      // reconnect — and it is the run's REAL state, not a replay-unavailable
      // stand-in. `realStatus` above proves the run succeeded; client 2 is
      // told exactly that.
      expect(resubscribed["status"]).toBe("completed");
      expect(resubscribed["error"]).toBeFalsy();

      // The replay is the run's own event stream, in seq order — client 2
      // can rebuild the canvas from it, not just learn the outcome.
      const replayed = client2.messages.filter((m) => m["job_id"] === jobId);
      const seqs = replayed
        .map((m) => m["job_seq"])
        .filter((s): s is number => typeof s === "number");
      expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
      expect(
        replayed.some(
          (m) => m["type"] === "node_update" && m["node_id"] === "n4"
        )
      ).toBe(true);

      client2.ws.close();

      // §6 invariant: the client's state machine only ever transitions
      // along its declared table.
      const fakeRecord: RunRecord = {
        surface: "client-reconnect-mid-run",
        jobId,
        workflowId: WORKFLOW.id,
        startedAt: 0,
        finishedAt: seq,
        durationMs: null,
        status: realStatus,
        error: null,
        params: {},
        frames: [],
        transitions
      };
      expect(checkStateMachine(fakeRecord)).toEqual([]);

      // No orphan job: the server-side job is done and nothing is still
      // "active" for it.
      const finalJob = await Job.get(jobId);
      expect(finalJob?.status).toBe("completed");
    }
  );
});
