/**
 * Realtime audio chunk bus — the React-free fast path from message delivery
 * to the playback worklet.
 *
 * Streamed audio chunks normally reach playback via ResultsStore →
 * component re-render → scheduling effect, which puts the entire React
 * commit pipeline in the latency-critical path: any main-thread jank
 * (canvas drags, large renders) delays chunk delivery past the worklet's
 * jitter buffer and audibly drops out. The bus lets the message handler
 * hand a chunk straight to the subscribed playback hook in the same task
 * the message arrives in.
 *
 * The ResultsStore append still happens in parallel — it serves replay,
 * restart and mount/unmount decisions, none of which are latency-critical.
 * Publisher and store share chunk object identity, so the playback hook's
 * WeakSet dedupes the two delivery paths.
 */
import type { Chunk } from "../../stores/ApiTypes";

type ChunkListener = (chunk: Chunk) => void;

const listeners = new Map<string, Set<ChunkListener>>();

/** Deliver a streamed audio chunk to live subscribers of `nodeId`. */
export function publishRealtimeAudioChunk(nodeId: string, chunk: Chunk): void {
  const set = listeners.get(nodeId);
  if (!set) return;
  for (const listener of set) {
    listener(chunk);
  }
}

/** Subscribe to live audio chunks for a node. Returns the unsubscriber. */
export function subscribeRealtimeAudioChunks(
  nodeId: string,
  listener: ChunkListener
): () => void {
  let set = listeners.get(nodeId);
  if (!set) {
    set = new Set();
    listeners.set(nodeId, set);
  }
  set.add(listener);
  return () => {
    const current = listeners.get(nodeId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(nodeId);
  };
}
