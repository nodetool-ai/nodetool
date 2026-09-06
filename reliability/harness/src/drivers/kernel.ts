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
import { createGraphNodeTypeResolver } from "@nodetool-ai/node-sdk";
import { ProcessingContext, listRegisteredProviderIds } from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import type { Journey, JourneyInteraction } from "../core/journey.js";
import {
  makeFrame,
  type ResourceCounterSnapshot,
  type RunFrame,
  type RunRecord
} from "../core/record.js";
import { AnchorWaiter } from "./anchors.js";
import { buildJourneyRegistry } from "./registry.js";
import { journeyPythonBridgeFactory } from "./python-bridge.js";
import { getInjectedHostStorage } from "../faults/host-faults.js";
import { RELIABILITY_FAULT_PROVIDER_ID } from "../faults/provider-faults.js";
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
          // A5 hydration-gap fix (docs/RELIABILITY_TASKS.md Track A):
          // connect the bridge here (not inside `ExecutionSession.create`)
          // so its discovered metadata can back a `resolveNodeType` fallback
          // — the same shape `websocket-client-session.ts`'s ws-server driver
          // gets via `createTestUiServer`'s `resolveUnknownNodeType`. Without
          // `propertyTypes`/`outputs` resolved, the oracle surface can't tell
          // a genuine multi-edge list-typed fan-in from an invalid non-list
          // one (correlation analysis rejects both identically when
          // `propertyTypes` is absent) — a real cross-surface divergence this
          // journey manifest used to work around with distinct handles
          // instead of a shared list handle. `ExecutionSession` still owns
          // closing this bridge (its `bridgeFactory` just hands back the
          // instance already connected here, never reconnecting).
          const workflowNodes = ((journey.workflow as { nodes?: unknown })
            .nodes ?? []) as ReadonlyArray<{ type?: unknown }>;
          const bridge = await journeyPythonBridgeFactory(workflowNodes, (t) =>
            registry.has(t)
          );
          const baseResolver = createGraphNodeTypeResolver(registry);
          const resolveNodeType = async (nodeType: string) => {
            const resolved = await baseResolver.resolveNodeType(nodeType);
            if (resolved) return resolved;
            // Mirrors the ws-server driver's `resolveUnknownNodeType`
            // exactly: real bridge metadata when the bridge knows the type,
            // else a permissive generic descriptor — never `null`. Returning
            // `null` here would make `Graph.loadFromDict` silently DROP the
            // node (its default `skipErrors: true`) instead of letting it
            // reach `resolveExecutor`/execution, where an unresolvable or
            // fault-injected bridge node is actually supposed to fail.
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
          };

          const sessionOptions: ExecutionSessionOptions = {
            graph: journey.workflow as unknown as RawGraphInput,
            registry,
            bridgeFactory: async () => bridge,
            workflowId: journey.manifest.name,
            params: journey.manifest.params,
            resolveNodeType,
            // §12: "strict mode is a kernel flag... the harness always sets
            // it" — the kernel driver is the oracle surface, so its advisory
            // checks (pending inbox work, pending control responses) are
            // always thrown violations, not log warnings.
            strict: true,
            // This driver is a custom-provider host: journeys wire an LLM
            // node to `reliability-fault-llm`, which `provider-faults.ts`
            // registers process-wide only while a provider fault is active.
            // The run preflight would otherwise refuse every journey that
            // names it with no fault applied — which is how the
            // unregistered-fault-name case reports, so the harness could no
            // longer report it. Declaring the catalog keeps a typo'd provider
            // an error while letting the fault id through; model ids are
            // fixtures with no offline catalog, so they stay unchecked.
            catalogs: {
              listProviderIds: () => [
                ...listRegisteredProviderIds(),
                RELIABILITY_FAULT_PROVIDER_ID
              ],
              listModelIds: () => undefined
            },
            // Journeys are hermetic: the fault provider needs no credential,
            // and no journey may depend on a real key being present.
            providerConfiguration: () => [],
            // This driver records the message stream frame by frame
            // (`pumpMessages` below), so it's one of the few callers that
            // actually drains `session.messages` — capture is opt-in exactly
            // so hosts that only await `result` don't queue messages unread.
            captureMessages: true
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

    // §6 "Cleanup and leaks": measured from the session itself
    // (`ExecutionSession.resourceCounters`), not inferred. The kernel driver
    // owns no WS slots, so those two are structurally zero here — the
    // ws-server driver is where they carry information.
    const counters: ResourceCounterSnapshot = {
      at: "after",
      ...session.resourceCounters(),
      activeJobs: 0,
      startingJobs: 0
    };

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
      frames,
      resourceCounters: [counters]
    };
  }
}
