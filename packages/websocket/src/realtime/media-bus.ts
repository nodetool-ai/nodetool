import type {
  RealtimeMediaBus as IRealtimeMediaBus,
  RealtimeMediaBusSlotMetrics,
  RealtimeMediaSlot,
  VideoFrame
} from "@nodetool/protocol";

function slotKey(nodeId: string, handle: string): string {
  return `${nodeId}:${handle}`;
}

type InternalSlot = RealtimeMediaSlot & {
  metrics: RealtimeMediaBusSlotMetrics;
};

type SessionBuckets = {
  inputs: Map<string, InternalSlot>;
  outputs: Map<string, InternalSlot>;
  outputListeners: Set<() => void>;
};

/**
 * Per-session latest-wins media plane. Single retained frame per (node, handle)
 * on each of the input and output maps.
 */
export class RealtimeMediaBus implements IRealtimeMediaBus {
  private readonly sessions = new Map<string, SessionBuckets>();

  private getOrCreateSession(sessionId: string): SessionBuckets {
    let s = this.sessions.get(sessionId);
    if (!s) {
      s = {
        inputs: new Map(),
        outputs: new Map(),
        outputListeners: new Set()
      };
      this.sessions.set(sessionId, s);
    }
    return s;
  }

  subscribeOutputs(sessionId: string, listener: () => void): () => void {
    const s = this.getOrCreateSession(sessionId);
    s.outputListeners.add(listener);
    return () => {
      s.outputListeners.delete(listener);
    };
  }

  private notifyOutputListeners(sessionId: string): void {
    const s = this.sessions.get(sessionId);
    if (!s) {
      return;
    }
    for (const cb of s.outputListeners) {
      try {
        cb();
      } catch {
        // Intentionally ignore listener errors — diagnostics only.
      }
    }
  }

  setInput(
    sessionId: string,
    nodeId: string,
    handle: string,
    frame: VideoFrame
  ): void {
    const s = this.getOrCreateSession(sessionId);
    const key = slotKey(nodeId, handle);
    const prev = s.inputs.get(key);
    const metrics: RealtimeMediaBusSlotMetrics = prev
      ? { ...prev.metrics }
      : { framesAccepted: 0, framesDropped: 0, lastSequence: 0 };
    metrics.framesAccepted += 1;
    if (prev) {
      metrics.framesDropped += 1;
    }
    metrics.lastSequence += 1;
    const slot: InternalSlot = {
      frame,
      sequence: metrics.lastSequence,
      receivedAt: Date.now(),
      metrics
    };
    s.inputs.set(key, slot);
  }

  getLatestInput(
    sessionId: string,
    nodeId: string,
    handle: string
  ): RealtimeMediaSlot | null {
    const s = this.sessions.get(sessionId);
    if (!s) {
      return null;
    }
    const slot = s.inputs.get(slotKey(nodeId, handle));
    if (!slot) {
      return null;
    }
    return {
      frame: slot.frame,
      sequence: slot.sequence,
      receivedAt: slot.receivedAt
    };
  }

  setOutput(
    sessionId: string,
    nodeId: string,
    handle: string,
    frame: VideoFrame
  ): void {
    const s = this.getOrCreateSession(sessionId);
    const key = slotKey(nodeId, handle);
    const prev = s.outputs.get(key);
    const metrics: RealtimeMediaBusSlotMetrics = prev
      ? { ...prev.metrics }
      : { framesAccepted: 0, framesDropped: 0, lastSequence: 0 };
    metrics.framesAccepted += 1;
    if (prev) {
      metrics.framesDropped += 1;
    }
    metrics.lastSequence += 1;
    const slot: InternalSlot = {
      frame,
      sequence: metrics.lastSequence,
      receivedAt: Date.now(),
      metrics
    };
    s.outputs.set(key, slot);
    this.notifyOutputListeners(sessionId);
  }

  getLatestOutput(
    sessionId: string,
    nodeId: string,
    handle: string
  ): RealtimeMediaSlot | null {
    const s = this.sessions.get(sessionId);
    if (!s) {
      return null;
    }
    const slot = s.outputs.get(slotKey(nodeId, handle));
    if (!slot) {
      return null;
    }
    return {
      frame: slot.frame,
      sequence: slot.sequence,
      receivedAt: slot.receivedAt
    };
  }

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  metrics(sessionId: string): {
    inputs: Record<string, RealtimeMediaBusSlotMetrics>;
    outputs: Record<string, RealtimeMediaBusSlotMetrics>;
  } {
    const s = this.sessions.get(sessionId);
    if (!s) {
      return { inputs: {}, outputs: {} };
    }
    const inputs: Record<string, RealtimeMediaBusSlotMetrics> = {};
    const outputs: Record<string, RealtimeMediaBusSlotMetrics> = {};
    for (const [k, v] of s.inputs) {
      inputs[k] = { ...v.metrics };
    }
    for (const [k, v] of s.outputs) {
      outputs[k] = { ...v.metrics };
    }
    return { inputs, outputs };
  }
}
