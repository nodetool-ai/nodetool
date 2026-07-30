/**
 * Kernel driver (§12) — the ONLY driver allowed to touch `ExecutionSession`;
 * its recorded stream is the oracle every other surface's driver diffs
 * against (§7, §12).
 *
 * Runs a journey's scripted `interactions` against a real `ExecutionSession`
 * over a fresh, fully-hermetic registry (`registry.ts`: real base nodes +
 * the harness's own fixture nodes, no Python bridge). Every emitted
 * `ProcessingMessage` is recorded as a `server_to_client` frame; there is no
 * `client_to_server` direction on this surface — the kernel has no wire, so
 * `pushInput`/`cancel` calls are in-process method calls, not frames.
 */
import { ExecutionSession, type RawGraphInput } from "@nodetool-ai/execution";
import type { Journey, JourneyInteraction } from "../core/journey.js";
import { makeFrame, type RunFrame, type RunRecord } from "../core/record.js";
import { AnchorWaiter } from "./anchors.js";
import { buildJourneyRegistry } from "./registry.js";
import type { RunDriver } from "./types.js";

/** Hermetic: this driver never spawns/dials a Python worker. */
const NO_BRIDGE = async (): Promise<null> => null;

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
          session = await ExecutionSession.create({
            graph: journey.workflow as unknown as RawGraphInput,
            registry,
            bridgeFactory: NO_BRIDGE,
            workflowId: journey.manifest.name,
            params: journey.manifest.params
          });
          pump = pumpMessages(session, frames, waiter, () => seq++);
          break;
        }
        case "cancel":
          if (!session) {
            throw new Error(
              `journey "${journey.manifest.name}": "cancel" interaction before "run"`
            );
          }
          session.cancel(
            typeof interaction.value === "string" ? interaction.value : "journey-cancel"
          );
          break;
        case "stream_input":
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
          await session.pushInput(interaction.nodeId, interaction.value);
          break;
        case "end_input_stream":
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
          session.finishInputStream(interaction.nodeId);
          break;
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
