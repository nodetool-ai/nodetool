import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createLogger } from "@nodetool-ai/config";
import {
  ModelObserver,
  type DBModel,
  type ModelChangeEvent,
  type ModelChangeMeta
} from "@nodetool-ai/models";
import {
  resourceEvents,
  type ResourceChangePayload
} from "../resource-events.js";

const log = createLogger("nodetool.resource-change-bus");
export const resourceChangePayloadSchema = z.object({
  resource_type: z.string(),
  event: z.enum(["created", "updated", "deleted"]),
  resource: z.record(z.string(), z.unknown()),
  ops: z.array(z.unknown()).optional(),
  owner_user_id: z.string().nullable().optional()
});
export type ResourceChange = z.infer<typeof resourceChangePayloadSchema>;
export type ResourceBusSignal = ResourceChange | { type: "resource_resync" };
export interface ResourceChangeTransport {
  publish(message: string): Promise<void>;
  close(): Promise<void>;
}
const envelopeSchema = z.object({
  origin: z.string(),
  payload: resourceChangePayloadSchema
});

function isResyncMarker(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { type?: unknown }).type === "resource_resync"
  );
}

export function serializeModelChange(
  instance: DBModel,
  event: ModelChangeEvent,
  meta?: ModelChangeMeta
): ResourceChange {
  const resource: Record<string, unknown> = {
    id: instance.partitionValue(),
    etag: instance.getEtag()
  };
  for (const field of ["workflow_id", "thread_id", "parent_id", "project_id", "updated_at"]) {
    const value = instance[field];
    if (typeof value === "string" && value.length > 0) {
      resource[field] = value;
    }
  }
  const payload: ResourceChange = {
    resource_type: instance.constructor.name.toLowerCase(),
    event,
    resource,
    owner_user_id:
      typeof instance.user_id === "string" ? instance.user_id : null
  };
  if (meta?.ops?.length) {
    payload.ops = structuredClone(meta.ops);
  }
  return payload;
}

export class ResourceChangeBus {
  private readonly listeners = new Set<(payload: ResourceBusSignal) => void>();
  private transport?: ResourceChangeTransport;
  constructor(readonly origin = randomUUID()) {}

  setTransport(transport: ResourceChangeTransport): void {
    this.transport = transport;
  }

  subscribe(fn: (payload: ResourceBusSignal) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  publish(payload: ResourceChange): void {
    // Encode before listeners run so a subscriber cannot change the remote event.
    const encoded = this.transport
      ? JSON.stringify({ origin: this.origin, payload })
      : undefined;
    this.deliverLocal(payload);
    if (encoded) {
      void this.transport?.publish(encoded).catch((error: unknown) => {
        log.error("Resource change publish failed", { error: String(error) });
      });
    }
  }

  /**
   * Accepts one envelope (the form replicas sent before batching) or a JSON
   * array of envelopes. A malformed single envelope throws so the caller
   * resyncs. A malformed array entry is logged and skipped. A
   * `{type: "resource_resync"}` entry, sent when a publisher dropped messages
   * under load, triggers one resync for the whole message.
   */
  receive(encoded: string): void {
    const parsed: unknown = JSON.parse(encoded);
    if (!Array.isArray(parsed)) {
      if (isResyncMarker(parsed)) {
        this.resync();
        return;
      }
      const { origin, payload } = envelopeSchema.parse(parsed);
      if (origin !== this.origin) {
        this.deliverLocal(payload);
      }
      return;
    }
    let resync = false;
    for (const entry of parsed) {
      if (isResyncMarker(entry)) {
        resync = true;
        continue;
      }
      const envelope = envelopeSchema.safeParse(entry);
      if (!envelope.success) {
        log.warn("Skipping malformed resource change in batch", {
          error: envelope.error.message
        });
        continue;
      }
      if (envelope.data.origin !== this.origin) {
        this.deliverLocal(envelope.data.payload);
      }
    }
    if (resync) {
      this.resync();
    }
  }

  resync(): void {
    this.deliverLocal({ type: "resource_resync" });
  }

  deliverLocal(payload: ResourceBusSignal): void {
    for (const listener of this.listeners) {
      try {
        listener(payload);
      } catch (error) {
        log.error("Resource change subscriber failed", {
          error: String(error)
        });
      }
    }
  }

  async close(): Promise<void> {
    await this.transport?.close();
    this.transport = undefined;
  }
}

export const resourceChangeBus = new ResourceChangeBus();
let feedsStarted = false;
const onModelChange = (
  instance: DBModel,
  event: ModelChangeEvent,
  meta?: ModelChangeMeta
): void => {
  resourceChangeBus.publish(serializeModelChange(instance, event, meta));
};
const onResourceEvent = (payload: ResourceChangePayload): void => {
  const { userId, localOnly, ...change } = payload;
  const serialized = { ...change, owner_user_id: userId };
  if (localOnly) {
    resourceChangeBus.deliverLocal(serialized);
  } else {
    resourceChangeBus.publish(serialized);
  }
};

export function startResourceChangeFeeds(): void {
  // Test database setup clears ModelObserver independently of this module.
  ModelObserver.unsubscribe(onModelChange);
  ModelObserver.subscribe(onModelChange);
  if (feedsStarted) return;
  resourceEvents.on("change", onResourceEvent);
  feedsStarted = true;
}

export function stopResourceChangeFeeds(): void {
  ModelObserver.unsubscribe(onModelChange);
  resourceEvents.off("change", onResourceEvent);
  feedsStarted = false;
}
