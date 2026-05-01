/**
 * In-process event bus that backs the /events SSE endpoint and the
 * message_notify_user / message_ask_user tools.
 *
 * Events are:
 *   - broadcast to every active SSE subscriber immediately
 *   - kept in a bounded ring buffer so late subscribers can replay
 *     recent events (useful when a client reconnects mid-task)
 *
 * The bus is a module-level singleton — each container runs exactly one
 * agent session, so there's no multi-tenancy concern.
 */

import { randomBytes } from "node:crypto";
import type { SandboxEvent } from "@nodetool-ai/sandbox/schemas";

const MAX_RING = 500;

type Subscriber = (event: SandboxEvent) => void;

const ring: SandboxEvent[] = [];
const subscribers = new Set<Subscriber>();

export function newEventId(): string {
  return randomBytes(8).toString("hex");
}

export function publish(event: SandboxEvent): void {
  ring.push(event);
  if (ring.length > MAX_RING) ring.splice(0, ring.length - MAX_RING);
  for (const sub of subscribers) {
    try {
      sub(event);
    } catch {
      // A broken subscriber must not take down siblings.
    }
  }
}

export function subscribe(sub: Subscriber): () => void {
  subscribers.add(sub);
  return () => {
    subscribers.delete(sub);
  };
}

export function replay(): SandboxEvent[] {
  return ring.slice();
}

export function _resetForTests(): void {
  ring.length = 0;
  subscribers.clear();
}
