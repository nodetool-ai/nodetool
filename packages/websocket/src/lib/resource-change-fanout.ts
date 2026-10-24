/** Routes serialized bus events to owners and workflow collaborators. */

import { createLogger } from "@nodetool-ai/config";
import { Workflow, WorkflowCollaborator } from "@nodetool-ai/models";
import {
  resourceChangeBus,
  startResourceChangeFeeds,
  type ResourceBusSignal
} from "./resource-change-bus.js";
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

const subscribers = new Set<ResourceChangeSubscriber>();
const workflowRecipients = new Map<string, Promise<Set<string>>>();
let unsubscribeBus: (() => void) | undefined;

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

const onResourceChange = (payload: ResourceBusSignal): void => {
  if ("type" in payload) {
    workflowRecipients.clear();
    deliverAll([...subscribers], payload);
    return;
  }
  if (payload.resource_type === "workflowcollaborator") {
    const workflowId = payload.resource["workflow_id"];
    if (typeof workflowId === "string") workflowRecipients.delete(workflowId);
  }
  const { owner_user_id, ...change } = payload;
  const ownerId = owner_user_id || null;
  const targets = acceptingSubscribers(ownerId);
  const frame = Object.freeze({ type: "resource_change", ...change });
  deliverAll(targets, frame);
  const workflowId = payload.resource_type === "workflow"
    ? payload.resource["id"]
    : payload.resource_type === "workflowversion"
      ? payload.resource["workflow_id"]
      : undefined;
  if (isNonEmptyString(workflowId) && ownerId) {
    deliverWorkflowChange(
      workflowId, ownerId, targets, () => frame,
      payload.resource_type === "workflow" && payload.event === "deleted"
    ).catch((error) => {
      log.error("Shared workflow change delivery failed", { error: String(error) });
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

/** Subscribe a session to local and remote changes through the shared bus. */
export function subscribeResourceChanges(
  subscriber: ResourceChangeSubscriber
): () => void {
  startResourceChangeFeeds();
  if (subscribers.size === 0) {
    unsubscribeBus = resourceChangeBus.subscribe(onResourceChange);
  }
  subscribers.add(subscriber);
  return () => {
    if (!subscribers.delete(subscriber) || subscribers.size > 0) return;
    unsubscribeBus?.();
    unsubscribeBus = undefined;
    workflowRecipients.clear();
  };
}
