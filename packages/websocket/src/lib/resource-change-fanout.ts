/**
 * One process-wide listener per change feed, shared by every connection.
 *
 * Each `resource_change` frame used to be built once per connected session:
 * every session put its own callback on `ModelObserver` and `resourceEvents`,
 * and each callback ran `getEtag()` — a JSON round-trip of every JSON column
 * (a whole workflow graph) plus a sha256 — for the same write. Here the frame
 * is built once per write and handed to every session that takes it. Sessions
 * keep their own access filtering through `accepts`.
 */

import { createLogger } from "@nodetool-ai/config";
import {
  ModelObserver,
  Workflow,
  WorkflowVersion,
  WorkflowCollaborator,
  type DBModel,
  type ModelChangeEvent,
  type ModelChangeMeta
} from "@nodetool-ai/models";
import {
  resourceEvents,
  type ResourceChangePayload
} from "../resource-events.js";
import { isNonEmptyString } from "./wire-values.js";

const log = createLogger("nodetool.websocket.resource-change-fanout");

/**
 * A built frame. The same object goes to every session, so nothing on the
 * send path may mutate it.
 */
export type ResourceChangeFrame = Readonly<Record<string, unknown>>;

export interface ResourceChangeSubscriber {
  /**
   * Whether this connection takes a change owned by `ownerId` (`null` for a
   * row or event with no owner). `recipients` includes users granted access
   * to a shared workflow and its owner.
   */
  accepts(ownerId: string | null, recipients?: ReadonlySet<string>): boolean;
  deliver(frame: ResourceChangeFrame): void;
}

/**
 * Scope fields for resource types whose cache is keyed on a parent id
 * (Message → thread_id, WorkflowVersion → workflow_id, a document →
 * project_id). Frontend handlers use these to narrow invalidation.
 * `updated_at` rides along as the row's concurrency token: an open editor
 * compares it against the token it last saved with to tell its own write
 * apart from one made outside the browser (agent, CLI, another tab).
 */
const FORWARDED_FIELDS = [
  "workflow_id",
  "thread_id",
  "parent_id",
  "project_id",
  "updated_at"
] as const;

const subscribers = new Set<ResourceChangeSubscriber>();
const workflowRecipients = new Map<string, Promise<Set<string>>>();

function ownerOf(instance: DBModel): string | null {
  // Models without a `user_id` (runtime-internal types) go to every
  // connection.
  const owner = instance["user_id"];
  return isNonEmptyString(owner) ? owner : null;
}

function acceptingSubscribers(
  ownerId: string | null,
  recipients?: ReadonlySet<string>
): ResourceChangeSubscriber[] {
  const out: ResourceChangeSubscriber[] = [];
  for (const subscriber of subscribers) {
    try {
      if (subscriber.accepts(ownerId, recipients)) out.push(subscriber);
    } catch (error) {
      log.error("resource_change subscriber filter failed", {
        error: String(error)
      });
    }
  }
  return out;
}

function deliverAll(
  targets: ResourceChangeSubscriber[],
  frame: ResourceChangeFrame
): void {
  for (const subscriber of targets) {
    try {
      subscriber.deliver(frame);
    } catch (error) {
      log.error("resource_change delivery failed", { error: String(error) });
    }
  }
}

export function buildModelChangeFrame(
  instance: DBModel,
  event: ModelChangeEvent,
  meta?: ModelChangeMeta
): ResourceChangeFrame {
  const resource: Record<string, unknown> = {
    id: instance.partitionValue(),
    etag: instance.getEtag()
  };
  for (const field of FORWARDED_FIELDS) {
    const value = instance[field];
    if (isNonEmptyString(value)) {
      resource[field] = value;
    }
  }
  const frame: Record<string, unknown> = {
    type: "resource_change",
    event,
    resource_type: instance.constructor.name.toLowerCase(),
    resource: Object.freeze(resource)
  };
  if (meta?.ops && meta.ops.length > 0) {
    frame.ops = meta.ops;
  }
  return Object.freeze(frame);
}

const onModelChange = (
  instance: DBModel,
  event: ModelChangeEvent,
  meta?: ModelChangeMeta
): void => {
  if (instance instanceof WorkflowCollaborator) {
    workflowRecipients.delete(instance.workflow_id);
  }
  const ownerId = ownerOf(instance);
  const targets = acceptingSubscribers(ownerId);
  let frame: ResourceChangeFrame | undefined;
  const getFrame = (): ResourceChangeFrame => {
    frame ??= buildModelChangeFrame(instance, event, meta);
    return frame;
  };
  if (targets.length > 0) {
    deliverAll(targets, getFrame());
  }
  const workflowId =
    instance instanceof Workflow
      ? instance.id
      : instance instanceof WorkflowVersion
        ? instance.workflow_id
        : undefined;
  if (workflowId && ownerId) {
    // Freeze the write token before the row can change during the grant lookup.
    getFrame();
    deliverWorkflowChange(
      workflowId,
      ownerId,
      targets,
      getFrame,
      instance instanceof Workflow && event === "deleted"
    ).catch((error) => {
      log.error("Shared workflow change delivery failed", {
        error: String(error)
      });
    });
  }
};

async function deliverWorkflowChange(
  workflowId: string,
  ownerId: string,
  delivered: readonly ResourceChangeSubscriber[],
  getFrame: () => ResourceChangeFrame,
  deleted: boolean
): Promise<void> {
  let pending = workflowRecipients.get(workflowId);
  if (!pending) {
    pending = Promise.all([
      WorkflowCollaborator.listForWorkflow(workflowId),
      Workflow.get<Workflow>(workflowId)
    ]).then(([grants, workflow]) => {
      const users = new Set(grants.map((grant) => grant.user_id));
      // A version's user_id identifies its author, who may be an editor.
      if (workflow) {
        users.add(workflow.user_id);
      }
      return users;
    });
    workflowRecipients.set(workflowId, pending);
  }
  let recipients: Set<string>;
  try {
    recipients = await pending;
  } catch (error) {
    if (workflowRecipients.get(workflowId) === pending) {
      workflowRecipients.delete(workflowId);
    }
    throw error;
  }
  if (subscribers.size === 0) {
    return;
  }
  // A grant may have been revoked while the database query was pending.
  if (workflowRecipients.get(workflowId) !== pending) {
    await deliverWorkflowChange(
      workflowId,
      ownerId,
      delivered,
      getFrame,
      deleted
    );
    return;
  }
  const alreadyDelivered = new Set(delivered);
  const targets = acceptingSubscribers(ownerId, recipients).filter(
    (subscriber) => !alreadyDelivered.has(subscriber)
  );
  if (targets.length > 0) {
    deliverAll(targets, getFrame());
  }
  if (deleted) {
    workflowRecipients.delete(workflowId);
  }
}

const onResourceEvent = (payload: ResourceChangePayload): void => {
  const targets = acceptingSubscribers(
    isNonEmptyString(payload.userId) ? payload.userId : null
  );
  if (targets.length === 0) return;
  deliverAll(
    targets,
    Object.freeze({
      type: "resource_change",
      event: payload.event,
      resource_type: payload.resource_type,
      resource: payload.resource
    })
  );
};

/**
 * Add a connection. The first one installs the shared listeners. The model
 * callback is put back on every call, because `ModelObserver.clear()` (test
 * setup) drops it without telling this module.
 */
export function subscribeResourceChanges(
  subscriber: ResourceChangeSubscriber
): () => void {
  if (subscribers.size === 0) {
    resourceEvents.on("change", onResourceEvent);
  }
  subscribers.add(subscriber);
  ModelObserver.unsubscribe(onModelChange);
  ModelObserver.subscribe(onModelChange);
  return () => {
    if (!subscribers.delete(subscriber)) return;
    if (subscribers.size > 0) return;
    ModelObserver.unsubscribe(onModelChange);
    resourceEvents.off("change", onResourceEvent);
    workflowRecipients.clear();
  };
}
