/** Routes serialized bus events to owners and workflow collaborators. */

import { createLogger } from "@nodetool-ai/config";
import {
  DocumentCollaborator,
  Workflow,
  WorkflowCollaborator,
  type SharedDocumentType
} from "@nodetool-ai/models";
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

/** Most cached recipient sets per kind. The oldest entry goes first. */
export const RECIPIENT_CACHE_LIMIT = 1000;

/**
 * Insertion-ordered map that evicts its oldest entry past `limit`. Evicting
 * is safe: a later change re-reads the grants from the database.
 */
class BoundedRecipientCache {
  private readonly entries = new Map<string, Promise<Set<string>>>();
  constructor(private readonly limit: number) {}
  get(key: string): Promise<Set<string>> | undefined {
    return this.entries.get(key);
  }
  set(key: string, value: Promise<Set<string>>): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }
  delete(key: string): void {
    this.entries.delete(key);
  }
  clear(): void {
    this.entries.clear();
  }
  get size(): number {
    return this.entries.size;
  }
}

/** Test hook: the number of cached recipient sets across both caches. */
export function recipientCacheSize(): number {
  return workflowRecipients.size + documentRecipients.size;
}

/**
 * `resource_type` (lowercased model class name) to the document kind that
 * `DocumentCollaborator` grants use.
 */
const DOCUMENT_TYPE_BY_RESOURCE: Readonly<Record<string, SharedDocumentType>> = {
  storyboard: "storyboard",
  script: "script",
  timelinesequence: "timeline",
  imagedocument: "sketch",
  application: "application",
  jsscript: "jsscript"
};

const subscribers = new Set<ResourceChangeSubscriber>();
const workflowRecipients = new BoundedRecipientCache(RECIPIENT_CACHE_LIMIT);
const documentRecipients = new BoundedRecipientCache(RECIPIENT_CACHE_LIMIT);
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
    documentRecipients.clear();
    deliverAll([...subscribers], payload);
    return;
  }
  if (payload.resource_type === "workflowcollaborator") {
    const workflowId = payload.resource["workflow_id"];
    if (typeof workflowId === "string") workflowRecipients.delete(workflowId);
  }
  // The serialized payload carries neither document_type nor document_id, so
  // any grant change drops the whole document cache. Grant changes are rare
  // and a miss costs one query, which is simpler than widening the payload.
  if (payload.resource_type === "documentcollaborator") {
    documentRecipients.clear();
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
  const documentType = DOCUMENT_TYPE_BY_RESOURCE[payload.resource_type];
  const documentId = payload.resource["id"];
  if (documentType && isNonEmptyString(documentId) && ownerId) {
    deliverDocumentChange(
      documentType, documentId, ownerId, targets, frame,
      payload.event === "deleted"
    ).catch((error) => {
      log.error("Shared document change delivery failed", { error: String(error) });
    });
  }
};

async function deliverDocumentChange(
  documentType: SharedDocumentType,
  documentId: string,
  ownerId: string,
  delivered: readonly ResourceChangeSubscriber[],
  frame: ResourceChangeFrame,
  deleted: boolean
): Promise<void> {
  const key = `${documentType}:${documentId}`;
  await deliverToRecipients(
    documentRecipients,
    key,
    async () => {
      const grants = await DocumentCollaborator.listForDocument(
        documentType,
        documentId
      );
      const users = new Set(grants.map((grant) => grant.user_id));
      users.add(ownerId);
      return users;
    },
    ownerId,
    delivered,
    () => frame,
    deleted
  );
}

async function deliverWorkflowChange(
  workflowId: string,
  ownerId: string,
  delivered: readonly ResourceChangeSubscriber[],
  getFrame: () => ResourceChangeFrame,
  deleted: boolean
): Promise<void> {
  await deliverToRecipients(
    workflowRecipients,
    workflowId,
    async () => {
      const [grants, workflow] = await Promise.all([
        WorkflowCollaborator.listForWorkflow(workflowId),
        Workflow.get<Workflow>(workflowId)
      ]);
      const users = new Set(grants.map((grant) => grant.user_id));
      // A version's user_id identifies its author, who may be an editor.
      if (workflow) {
        users.add(workflow.user_id);
      }
      return users;
    },
    ownerId,
    delivered,
    getFrame,
    deleted
  );
}

async function deliverToRecipients(
  cache: BoundedRecipientCache,
  key: string,
  resolve: () => Promise<Set<string>>,
  ownerId: string,
  delivered: readonly ResourceChangeSubscriber[],
  getFrame: () => ResourceChangeFrame,
  deleted: boolean
): Promise<void> {
  // At most one re-resolution after a revoke race or an eviction. The second
  // pass delivers with the set it just resolved, so this cannot loop.
  for (let attempt = 0; attempt < 2; attempt++) {
    let pending = cache.get(key);
    if (!pending) {
      pending = resolve();
      cache.set(key, pending);
    }
    let recipients: Set<string>;
    try {
      recipients = await pending;
    } catch (error) {
      if (cache.get(key) === pending) {
        cache.delete(key);
      }
      throw error;
    }
    if (subscribers.size === 0) {
      return;
    }
    // A grant may have been revoked while the database query was pending.
    if (attempt === 0 && cache.get(key) !== pending) {
      continue;
    }
    const alreadyDelivered = new Set(delivered);
    const targets = acceptingSubscribers(ownerId, recipients).filter(
      (subscriber) => !alreadyDelivered.has(subscriber)
    );
    if (targets.length > 0) {
      deliverAll(targets, getFrame());
    }
    if (deleted) {
      cache.delete(key);
    }
    return;
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
    documentRecipients.clear();
  };
}
