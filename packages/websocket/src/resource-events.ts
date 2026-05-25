/**
 * Process-wide resource change emitter for non-DBModel resources
 * (collections, model installs, etc.) that need to broadcast cache
 * invalidations to connected clients.
 *
 * DBModel mutations already broadcast via `ModelObserver` from
 * `@nodetool-ai/models`. Use this emitter for resources that don't go
 * through a DBModel.
 */

import { EventEmitter } from "node:events";

export type ResourceChangeEvent = "created" | "updated" | "deleted";

export interface ResourceChangePayload {
  event: ResourceChangeEvent;
  resource_type: string;
  resource: Record<string, unknown> & { id: string; etag?: string };
  /** When set, only sessions for this user receive the event. */
  userId?: string | null;
}

class ResourceEventEmitter extends EventEmitter {
  emitChange(payload: ResourceChangePayload): void {
    this.emit("change", payload);
  }
}

export const resourceEvents = new ResourceEventEmitter();

export function notifyResourceChange(payload: ResourceChangePayload): void {
  resourceEvents.emitChange(payload);
}
