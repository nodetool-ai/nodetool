/**
 * The native apps' local store for documents that live on a cloud server:
 * durable drafts of unsent edits, and the last known open state of each
 * document (docs/plans/native-cloud-sync/technical-design.md, "Local data
 * scoping and durable drafts").
 *
 * Every function takes a {@link CloudLocalScope}: the local user, the cloud
 * server key and the cloud account. Every query filters on all three, so the
 * sender of one account never selects another account's rows (TC10).
 *
 * The tables live in the local SQLite database of the server bundled with
 * each native app. A draft write and an acceptance commit with
 * `synchronous = FULL`, so a write that returned survives a power loss. The
 * connection runs with `NORMAL` otherwise, and returns to it after the write.
 */

import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDatabase, getPortableDb, getRawDb } from "./db.js";
import {
  cloudDrafts,
  cloudOpenState,
  type CloudDocumentOptions
} from "./schema/cloud-local.js";

/** The local user and the cloud account a row belongs to. */
export interface CloudLocalScope {
  userId: string;
  /** First 16 hex characters of the SHA-256 of the cloud server origin. */
  serverKey: string;
  accountId: string;
}

/** A cloud document, named by its kind (`workflow`, `timeline`, …) and id. */
export interface CloudDocumentRef {
  kind: string;
  documentId: string;
}

/** The server version a draft edits, or the version a save produced. */
export interface CloudBase {
  updatedAt: string;
  contentHash: string;
}

export type CloudDraftRow = typeof cloudDrafts.$inferSelect;
export type CloudOpenStateRow = typeof cloudOpenState.$inferSelect;

/** What {@link CloudLocalStore.acceptSave} did with the draft row. */
export type AcceptOutcome =
  /** The accepted send was the latest draft. The row is gone. */
  | "deleted"
  /** The draft changed after the send. The row stays, rebased on the accepted version. */
  | "rebased"
  /** No draft row existed. Only the open state was updated. */
  | "no_draft";

function scopeCondition(scope: CloudLocalScope, doc: CloudDocumentRef) {
  return and(
    eq(cloudDrafts.user_id, scope.userId),
    eq(cloudDrafts.server_key, scope.serverKey),
    eq(cloudDrafts.account_id, scope.accountId),
    eq(cloudDrafts.kind, doc.kind),
    eq(cloudDrafts.document_id, doc.documentId)
  );
}

function openStateCondition(scope: CloudLocalScope, doc: CloudDocumentRef) {
  return and(
    eq(cloudOpenState.user_id, scope.userId),
    eq(cloudOpenState.server_key, scope.serverKey),
    eq(cloudOpenState.account_id, scope.accountId),
    eq(cloudOpenState.kind, doc.kind),
    eq(cloudOpenState.document_id, doc.documentId)
  );
}

function requireScope(scope: CloudLocalScope): void {
  if (!scope.userId || !scope.serverKey || !scope.accountId) {
    throw new Error(
      "A cloud local store call needs a user, a server key and an account"
    );
  }
}

const SQLITE_ONLY =
  "The cloud local store runs on the local SQLite database only";

function newId(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Commit the next transaction with full synchronous flushing. Call
 * {@link endFullSync} in a `finally` after it.
 */
function beginFullSync(): void {
  getRawDb().pragma("synchronous = FULL");
}

function endFullSync(): void {
  getRawDb().pragma("synchronous = NORMAL");
}

export const CloudLocalStore = {
  /**
   * Store the whole edited document as the draft of `doc`, in state
   * `waiting`. Returns the row's new revision. When this returns, the edit
   * counts as stored locally (FR11 step 2).
   */
  async putDraft(
    scope: CloudLocalScope,
    doc: CloudDocumentRef,
    base: CloudBase,
    draft: string,
    now: Date = new Date()
  ): Promise<number> {
    requireScope(scope);
    const at = now.toISOString();
    const c = getDatabase();
    if (c.dialect === "sqlite") {
      beginFullSync();
      try {
        return c.db.transaction((tx) => {
          const existing = tx
            .select({ revision: cloudDrafts.revision })
            .from(cloudDrafts)
            .where(scopeCondition(scope, doc))
            .get();
          const revision = (existing?.revision ?? 0) + 1;
          if (existing) {
            tx.update(cloudDrafts)
              .set({
                base_updated_at: base.updatedAt,
                base_content_hash: base.contentHash,
                draft,
                state: "waiting",
                refusal_reason: null,
                revision,
                updated_at: at
              })
              .where(scopeCondition(scope, doc))
              .run();
          } else {
            tx.insert(cloudDrafts)
              .values({
                id: newId(),
                user_id: scope.userId,
                server_key: scope.serverKey,
                account_id: scope.accountId,
                kind: doc.kind,
                document_id: doc.documentId,
                base_updated_at: base.updatedAt,
                base_content_hash: base.contentHash,
                draft,
                state: "waiting",
                refusal_reason: null,
                revision,
                created_at: at,
                updated_at: at
              })
              .run();
          }
          return revision;
        });
      } finally {
        endFullSync();
      }
    }
    throw new Error(SQLITE_ONLY);
  },

  async getDraft(
    scope: CloudLocalScope,
    doc: CloudDocumentRef
  ): Promise<CloudDraftRow | null> {
    requireScope(scope);
    const rows = await getPortableDb()
      .select()
      .from(cloudDrafts)
      .where(scopeCondition(scope, doc))
      .limit(1);
    return rows[0] ?? null;
  },

  /** Every draft of the account, oldest first. The sender reads this. */
  async listDrafts(
    scope: CloudLocalScope,
    state?: "waiting" | "unsent"
  ): Promise<CloudDraftRow[]> {
    requireScope(scope);
    const conditions = [
      eq(cloudDrafts.user_id, scope.userId),
      eq(cloudDrafts.server_key, scope.serverKey),
      eq(cloudDrafts.account_id, scope.accountId)
    ];
    if (state) {
      conditions.push(eq(cloudDrafts.state, state));
    }
    return getPortableDb()
      .select()
      .from(cloudDrafts)
      .where(and(...conditions))
      .orderBy(cloudDrafts.created_at);
  },

  /**
   * The server accepted the save of draft `revision` and produced `base`.
   * The draft row is deleted when it is still that revision. A newer row
   * stays, rebased on `base`, so edits made during the send are kept. The
   * open state records the new base and the contact, in the same
   * transaction (FR11 step 3).
   */
  async acceptSave(
    scope: CloudLocalScope,
    doc: CloudDocumentRef,
    revision: number,
    base: CloudBase,
    access: { role: string; options: CloudDocumentOptions },
    now: Date = new Date()
  ): Promise<AcceptOutcome> {
    requireScope(scope);
    const at = now.toISOString();
    const openRow = {
      id: newId(),
      user_id: scope.userId,
      server_key: scope.serverKey,
      account_id: scope.accountId,
      kind: doc.kind,
      document_id: doc.documentId,
      role: access.role,
      options: access.options,
      base_updated_at: base.updatedAt,
      base_content_hash: base.contentHash,
      last_contact_at: at,
      updated_at: at
    };
    const openUpdate = {
      role: access.role,
      options: access.options,
      base_updated_at: base.updatedAt,
      base_content_hash: base.contentHash,
      last_contact_at: at,
      updated_at: at
    };
    const c = getDatabase();
    if (c.dialect === "sqlite") {
      beginFullSync();
      try {
        return c.db.transaction((tx) => {
          const draft = tx
            .select({ revision: cloudDrafts.revision })
            .from(cloudDrafts)
            .where(scopeCondition(scope, doc))
            .get();
          let outcome: AcceptOutcome = "no_draft";
          if (draft && draft.revision === revision) {
            tx.delete(cloudDrafts).where(scopeCondition(scope, doc)).run();
            outcome = "deleted";
          } else if (draft) {
            tx.update(cloudDrafts)
              .set({
                base_updated_at: base.updatedAt,
                base_content_hash: base.contentHash,
                updated_at: at
              })
              .where(scopeCondition(scope, doc))
              .run();
            outcome = "rebased";
          }
          const existing = tx
            .select({ id: cloudOpenState.id })
            .from(cloudOpenState)
            .where(openStateCondition(scope, doc))
            .get();
          if (existing) {
            tx.update(cloudOpenState)
              .set(openUpdate)
              .where(openStateCondition(scope, doc))
              .run();
          } else {
            tx.insert(cloudOpenState).values(openRow).run();
          }
          return outcome;
        });
      } finally {
        endFullSync();
      }
    }
    throw new Error(SQLITE_ONLY);
  },

  /**
   * The server refused the save of draft `revision` with `reason`. The row
   * stays as `unsent` and nothing is lost. A newer revision stays `waiting`.
   */
  async markUnsent(
    scope: CloudLocalScope,
    doc: CloudDocumentRef,
    revision: number,
    reason: string,
    now: Date = new Date()
  ): Promise<boolean> {
    requireScope(scope);
    const updated = await getPortableDb()
      .update(cloudDrafts)
      .set({
        state: "unsent",
        refusal_reason: reason,
        updated_at: now.toISOString()
      })
      .where(
        and(scopeCondition(scope, doc), eq(cloudDrafts.revision, revision))
      )
      .returning({ id: cloudDrafts.id });
    return updated.length > 0;
  },

  /** Delete a draft the person chose to discard (FR30). */
  async discardDraft(
    scope: CloudLocalScope,
    doc: CloudDocumentRef
  ): Promise<boolean> {
    requireScope(scope);
    const deleted = await getPortableDb()
      .delete(cloudDrafts)
      .where(scopeCondition(scope, doc))
      .returning({ id: cloudDrafts.id });
    return deleted.length > 0;
  },

  /** Record a successful contact with the role and options the server reported. */
  async recordContact(
    scope: CloudLocalScope,
    doc: CloudDocumentRef,
    access: { role: string; options: CloudDocumentOptions; base?: CloudBase },
    now: Date = new Date()
  ): Promise<void> {
    requireScope(scope);
    const at = now.toISOString();
    const existing = await CloudLocalStore.getOpenState(scope, doc);
    const set = {
      role: access.role,
      options: access.options,
      base_updated_at:
        access.base?.updatedAt ?? existing?.base_updated_at ?? null,
      base_content_hash:
        access.base?.contentHash ?? existing?.base_content_hash ?? null,
      last_contact_at: at,
      updated_at: at
    };
    if (existing) {
      await getPortableDb()
        .update(cloudOpenState)
        .set(set)
        .where(openStateCondition(scope, doc));
      return;
    }
    await getPortableDb()
      .insert(cloudOpenState)
      .values({
        id: newId(),
        user_id: scope.userId,
        server_key: scope.serverKey,
        account_id: scope.accountId,
        kind: doc.kind,
        document_id: doc.documentId,
        ...set
      });
  },

  async getOpenState(
    scope: CloudLocalScope,
    doc: CloudDocumentRef
  ): Promise<CloudOpenStateRow | null> {
    requireScope(scope);
    const rows = await getPortableDb()
      .select()
      .from(cloudOpenState)
      .where(openStateCondition(scope, doc))
      .limit(1);
    return rows[0] ?? null;
  }
};
