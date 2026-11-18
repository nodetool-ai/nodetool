/**
 * The desktop app's drafts of cloud documents, in its own local server: the
 * `cloudLocal.drafts.*` procedures the native apps call too, so the rows are
 * the same (WP1.10, WP1.15). Every call names the server key and the
 * account, so one account never reads another account's rows.
 */
import type { RouterInputs, RouterOutputs } from "../../trpc/client";
import type {
  AcceptOutcome,
  CloudBase,
  CloudDocumentKey,
  CloudDocumentOptions,
  DraftStore,
  StoredDraft
} from "./CloudDocumentSaver";

type Drafts = RouterInputs["cloudLocal"]["drafts"];
type DraftsOut = RouterOutputs["cloudLocal"]["drafts"];

/** What the store needs of the local tRPC client's `cloudLocal.drafts`. */
export interface LocalDraftsClient {
  put: { mutate: (input: Drafts["put"]) => Promise<DraftsOut["put"]> };
  get: { query: (input: Drafts["get"]) => Promise<DraftsOut["get"]> };
  accept: { mutate: (input: Drafts["accept"]) => Promise<DraftsOut["accept"]> };
  markUnsent: { mutate: (input: Drafts["markUnsent"]) => Promise<DraftsOut["markUnsent"]> };
}

function ref(key: CloudDocumentKey) {
  return {
    server_key: key.serverKey,
    account_id: key.accountId,
    kind: key.kind,
    document_id: key.documentId
  };
}

function wireBase(base: CloudBase) {
  return { updated_at: base.updatedAt, content_hash: base.contentHash };
}

/** The first 16 hex characters of the SHA-256 of a server origin. */
export async function serverKeyOf(origin: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(origin));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

export class LocalDraftStore implements DraftStore {
  constructor(private readonly drafts: LocalDraftsClient) {}

  async put(key: CloudDocumentKey, base: CloudBase, draft: string): Promise<string | null> {
    try {
      return (await this.drafts.put.mutate({ ...ref(key), base: wireBase(base), draft })).draft_id;
    } catch {
      return null;
    }
  }

  async accept(
    key: CloudDocumentKey,
    draftId: string,
    sentBase: CloudBase,
    base: CloudBase,
    role: string,
    options: CloudDocumentOptions
  ): Promise<AcceptOutcome | null> {
    try {
      const answer = await this.drafts.accept.mutate({
        ...ref(key),
        draft_id: draftId,
        sent_base: wireBase(sentBase),
        base: wireBase(base),
        role,
        options: {
          allow_history: options.allowHistory,
          allow_download: options.allowDownload,
          allow_duplicate: options.allowDuplicate
        }
      });
      return answer.outcome;
    } catch {
      return null;
    }
  }

  async markUnsent(key: CloudDocumentKey, draftId: string, reason: string): Promise<boolean> {
    try {
      // The store keeps reasons up to 256 characters.
      await this.drafts.markUnsent.mutate({ ...ref(key), draft_id: draftId, reason: reason.slice(0, 256) || "REFUSED" });
      return true;
    } catch {
      return false;
    }
  }

  /** The draft this account left for a document, to resume it. Null when the store did not answer. */
  async load(key: CloudDocumentKey): Promise<{ draft: StoredDraft | null } | null> {
    try {
      const answer = await this.drafts.get.query(ref(key));
      const row = answer.draft;
      return {
        draft: row
          ? {
              key,
              draftId: row.draft_id,
              base: { updatedAt: row.base.updated_at, contentHash: row.base.content_hash },
              draft: row.draft,
              state: row.state,
              refusal: row.refusal_reason ?? ""
            }
          : null
      };
    } catch {
      return null;
    }
  }
}
