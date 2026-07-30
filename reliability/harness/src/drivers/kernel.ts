/**
 * Kernel driver (§12) — the ONLY driver allowed to touch `ExecutionSession`;
 * its recorded stream is the oracle every other surface's driver diffs
 * against (§7, §12).
 *
 * Runs a journey's scripted `interactions` against a real `ExecutionSession`
 * over a fresh, fully-hermetic registry (`registry.ts`: real base nodes +
 * the harness's own fixture nodes). The bridge factory is
 * `journeyPythonBridgeFactory` (`python-bridge.ts`, task D3) — a real Python
 * worker is never spawned; a graph with an unresolved node type (journey 7,
 * `python-node-workflow`) gets E2's faithful stdio fake instead, everything
 * else gets no bridge at all (`connectPythonBridgeForGraph` only spawns when
 * the graph actually needs one), so this driver stays hermetic either way.
 * Every emitted
 * `ProcessingMessage` is recorded as a `server_to_client` frame. The kernel
 * has no wire, so `pushInput`/`cancel` are in-process method calls, not real
 * frames — but this driver still records a synthetic `client_to_server`
 * envelope (same `{command, data}` shape the ws-server/packaged drivers send
 * over the wire) for each one, purely so surface-agnostic invariant checks
 * that key off command intent (e.g. `terminal-uniqueness`'s
 * `hasCancelRequest`, which looks for a `cancel_job` command frame) see the
 * same evidence on every surface. `compareJourney`'s cross-surface diff
 * ignores this direction entirely (`onlyServerToClient` in `compare.ts`), so
 * these synthetic frames can never cause a false divergence.
 */
import { randomUUID } from "node:crypto";
import {
  ExecutionSession,
  type ExecutionSessionOptions,
  type RawGraphInput
} from "@nodetool-ai/execution";
import { InMemoryStorageAdapter, ProcessingContext } from "@nodetool-ai/runtime";
import type { Journey, JourneyInteraction } from "../core/journey.js";
import { makeFrame, type RunFrame, type RunRecord } from "../core/record.js";
import { AnchorWaiter } from "./anchors.js";
import { buildJourneyRegistry } from "./registry.js";
import { journeyPythonBridgeFactory } from "./python-bridge.js";
import { getInjectedHostStorage } from "../faults/host-faults.js";
import type { RunDriver } from "./types.js";

async function pumpMessages(
  session: ExecutionSession,
  frames: RunFrame[],
  waiter: AnchorWaiter,
  nextSeq: () => number
): Promise<void> {
  for await (const message of session.messages) {
    frames.push(
      makeFrame(
        nextSeq(),
        "kernel",
        "server_to_client",
        message as unknown as Record<string, unknown>
      )
    );
    waiter.notify(message as unknown as Record<string, unknown>);
  }
}

export class KernelDriver implements RunDriver {
  readonly name = "kernel";

  async run(journey: Journey): Promise<RunRecord> {
    const registry = buildJourneyRegistry();
    const frames: RunFrame[] = [];
    let seq = 0;
    const waiter = new AnchorWaiter();
    let session: ExecutionSession | null = null;
    let pump: Promise<void> | null = null;

    const interactions: JourneyInteraction[] =
      journey.interactions.length > 0 ? journey.interactions : [{ action: "run" }];

    for (const interaction of interactions) {
      if (interaction.at) {
        // Registering the waiter here — synchronously, with no `await`
        // between a prior "run"'s `pump = pumpMessages(...)` call and this
        // line — is what keeps this race-free (see anchors.ts's doc comment).
        await waiter.wait(interaction.at);
      }

      switch (interaction.action) {
        case "run": {
          const sessionOptions: ExecutionSessionOptions = {
            graph: journey.workflow as unknown as RawGraphInput,
            registry,
            bridgeFactory: journeyPythonBridgeFactory,
            workflowId: journey.manifest.name,
            params: journey.manifest.params,
            // §12: "strict mode is a kernel flag... the harness always sets
            // it" — the kernel driver is the oracle surface, so its advisory
            // checks (pending inbox work, pending control responses) are
            // always thrown violations, not log warnings.
            strict: true
          };
          // Every kernel run gets a working (in-memory, hermetic) storage
          // adapter — `ExecutionSession`'s own default context wires none at
          // all, but a journey like `host-disk-full-write` (task D3) needs
          // one to write through on its happy-path run before the fault
          // matrix below swaps it for an ENOSPC-throwing one
          // (`faults/host-faults.ts`'s `host-disk-full`,
          // {@link getInjectedHostStorage}). No shipped journey before this
          // one wrote an asset, so giving every run a real (if unused)
          // adapter instead of `null` changes nothing else.
          const jobId = randomUUID();
          sessionOptions.jobId = jobId;
          sessionOptions.context = new ProcessingContext({
            jobId,
            workflowId: journey.manifest.name,
            userId: "1",
            storage: getInjectedHostStorage() ?? new InMemoryStorageAdapter()
          });
          session = await ExecutionSession.create(sessionOptions);
          pump = pumpMessages(session, frames, waiter, () => seq++);
          break;
        }
        case "cancel": {
          if (!session) {
            throw new Error(
              `journey "${journey.manifest.name}": "cancel" interaction before "run"`
            );
          }
          const reason =
            typeof interaction.value === "string" ? interaction.value : "journey-cancel";
          frames.push(
            makeFrame(seq++, "kernel", "client_to_server", {
              command: "cancel_job",
              data: { job_id: session.jobId, reason }
            })
          );
          session.cancel(reason);
          break;
        }
        case "stream_input": {
          if (!session) {
            throw new Error(
              `journey "${journey.manifest.name}": "stream_input" interaction before "run"`
            );
          }
          if (!interaction.nodeId) {
            throw new Error(
              `journey "${journey.manifest.name}": "stream_input" interaction needs nodeId`
            );
          }
          frames.push(
            makeFrame(seq++, "kernel", "client_to_server", {
              command: "stream_input",
              data: { job_id: session.jobId, input: interaction.nodeId, value: interaction.value }
            })
          );
          await session.pushInput(interaction.nodeId, interaction.value);
          break;
        }
        case "end_input_stream": {
          if (!session) {
            throw new Error(
              `journey "${journey.manifest.name}": "end_input_stream" interaction before "run"`
            );
          }
          if (!interaction.nodeId) {
            throw new Error(
              `journey "${journey.manifest.name}": "end_input_stream" interaction needs nodeId`
            );
          }
          frames.push(
            makeFrame(seq++, "kernel", "client_to_server", {
              command: "end_input_stream",
              data: { job_id: session.jobId, input: interaction.nodeId }
            })
          );
          session.finishInputStream(interaction.nodeId);
          break;
        }
        case "reconnect":
          // The kernel has no transport to drop/reconnect — this surface has
          // nothing to exercise for a reconnect interaction.
          throw new Error(
            `journey "${journey.manifest.name}": kernel driver does not support ` +
              `the "reconnect" interaction (no transport)`
          );
      }
    }

    if (!session) {
      throw new Error(`journey "${journey.manifest.name}" has no "run" interaction`);
    }

    const result = await session.result;
    if (pump) await pump;

    return {
      journeyId: journey.manifest.name,
      surface: this.name,
      jobId: session.jobId,
      workflowId: session.workflowId,
      startedAt: frames.length > 0 ? frames[0].ts : null,
      finishedAt: frames.length > 0 ? frames[frames.length - 1].ts : null,
      durationMs: null,
      status: result.status,
      error: result.error ?? null,
      params: journey.manifest.params,
      frames
    };
  }
}
