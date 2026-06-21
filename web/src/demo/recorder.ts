/**
 * CastRecorder — capture one real workflow run into a replayable cast.
 *
 * Usage (from the editor, e.g. a dev-only "Record demo" action):
 *
 *   const rec = new CastRecorder();
 *   rec.start({ workflowId, getWorkflow, getMetadata });
 *   // … click Run, let it finish …
 *   const cast = rec.stop({ name: "Image generation demo" });
 *   downloadCastJson(cast);            // → <cast>.cast.json
 *
 * The recorder taps the same message stream the UI consumes
 * (`globalWebSocketManager` "message" events), so what you record is exactly
 * what the product rendered. Asset URLs are rewritten to `cast-asset://<key>`
 * and listed in the manifest; run `scripts/pin-cast-assets.ts` once to download
 * the bytes so the cast replays with no backend and no further generations.
 */
import { v4 as uuidv4 } from "uuid";

import { globalWebSocketManager } from "../lib/websocket/GlobalWebSocketManager";
import type { WebSocketMessage } from "../lib/websocket/GlobalWebSocketManager";
import type { NodeMetadata, Workflow } from "../stores/ApiTypes";

import {
  CAST_VERSION,
  type CastEvent,
  type DemoCast,
} from "./castTypes";
import { collectAndRewriteAssets } from "./assetSubstitution";

export interface StartRecordingOptions {
  /** Only messages for this workflow are captured. */
  workflowId: string;
  /** Snapshot of the pre-run graph (real node positions). Cloned at start. */
  getWorkflow: () => Workflow;
  /** Full node metadata; filtered to the types the graph uses. */
  getMetadata: () => Record<string, NodeMetadata>;
}

export interface StopRecordingOptions {
  name: string;
  description?: string;
  /** Suggested render frame rate. Default 30. */
  fps?: number;
  /** Hold time appended after the last event so the final frame lingers. */
  tailHoldMs?: number;
  /** Optional fixed camera (editor viewport) for deterministic framing. */
  viewport?: { x: number; y: number; zoom: number };
}

/** Drop values JSON can't represent (typed arrays from binary audio chunks). */
function jsonSafe(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return null;
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = jsonSafe(v);
    }
    return out;
  }
  return value;
}

/** Keep only the metadata entries for node types present in the graph. */
function pickUsedMetadata(
  workflow: Workflow,
  metadata: Record<string, NodeMetadata>
): Record<string, NodeMetadata> {
  const used: Record<string, NodeMetadata> = {};
  for (const node of workflow.graph?.nodes ?? []) {
    const meta = metadata[node.type];
    if (meta) used[node.type] = meta;
  }
  return used;
}

export class CastRecorder {
  private events: CastEvent[] = [];
  private startTimeMs = 0;
  private unsubscribe: (() => void) | null = null;
  private workflow: Workflow | null = null;
  private metadata: Record<string, NodeMetadata> = {};

  get isRecording(): boolean {
    return this.unsubscribe !== null;
  }

  start(opts: StartRecordingOptions): void {
    if (this.unsubscribe) throw new Error("CastRecorder already recording");
    this.events = [];
    this.startTimeMs = 0;
    this.workflow = structuredClone(opts.getWorkflow());
    this.metadata = pickUsedMetadata(this.workflow, opts.getMetadata());

    this.unsubscribe = globalWebSocketManager.subscribeEvent(
      "message",
      (message: WebSocketMessage) => {
        if (message.workflow_id !== opts.workflowId) return;
        const now = performance.now();
        if (this.events.length === 0) this.startTimeMs = now;
        this.events.push({
          t: Math.max(0, Math.round(now - this.startTimeMs)),
          message: jsonSafe(message) as CastEvent["message"],
        });
      }
    );
  }

  stop(opts: StopRecordingOptions): DemoCast {
    if (!this.unsubscribe || !this.workflow) {
      throw new Error("CastRecorder is not recording");
    }
    this.unsubscribe();
    this.unsubscribe = null;

    const lastT = this.events.length ? this.events[this.events.length - 1].t : 0;
    const durationMs = lastT + (opts.tailHoldMs ?? 1500);
    const { events, assets } = collectAndRewriteAssets(this.events);

    const cast: DemoCast = {
      version: CAST_VERSION,
      id: uuidv4(),
      name: opts.name,
      description: opts.description,
      createdAt: new Date().toISOString(),
      durationMs,
      fps: opts.fps ?? 30,
      workflow: this.workflow,
      metadata: this.metadata,
      events,
      assets,
      viewport: opts.viewport,
    };

    this.workflow = null;
    this.events = [];
    return cast;
  }
}

/** Trigger a browser download of the cast JSON (dev convenience). */
export function downloadCastJson(cast: DemoCast): void {
  const blob = new Blob([JSON.stringify(cast, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${cast.name.replace(/[^A-Za-z0-9._-]+/g, "-")}.cast.json`;
  a.click();
  URL.revokeObjectURL(url);
}
