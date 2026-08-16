/**
 * Per-document store: load, local edits, dirty tracking, and concurrency-checked
 * save.
 *
 * One store instance per open document, cached by kind + id and created on
 * demand — the same factory-in-a-Map shape `WorkflowRunner` already uses. That
 * matters here because the agent tools run outside React: they mutate the same
 * store the screen renders from, so an agent edit repaints immediately, and a
 * save triggered from a tool is the same code path as the user's Save button.
 *
 * Transport is a per-kind backend (`backends.ts`) rather than a mutation hook,
 * for the same reason. Every write echoes back the concurrency token it read —
 * a revision for the `resources` kinds, `baseUpdatedAt` for scripts — and the
 * server rejects a stale write instead of applying it, which surfaces here as
 * `status: 'conflict'` for the screen to offer a reload.
 */

import { create, type StoreApi, type UseBoundStore } from "zustand";

import { documentBackend } from "./backends";
import type { DocumentKind } from "./kinds";

export type DocumentStatus =
  | "idle"
  | "loading"
  | "saving"
  | "conflict"
  | "error";

export interface DocumentState<Doc> {
  kind: DocumentKind;
  id: string;
  /** The document body. Null until the first load resolves. */
  doc: Doc | null;
  name: string;
  /**
   * The concurrency token from the last read or write, echoed back on the next
   * write. Opaque here: only the kind's backend knows its shape.
   */
  token: unknown;
  updatedAt: string | null;
  dirty: boolean;
  status: DocumentStatus;
  error: string | null;

  /** Fetch from the server, replacing any local state. */
  load: () => Promise<void>;
  /** Apply a local edit. Marks the document dirty; does not save. */
  edit: (mutate: (doc: Doc) => Doc) => void;
  /** Rename locally. Marks dirty. */
  rename: (name: string) => void;
  /** Persist the current body. No-op when clean. */
  save: () => Promise<void>;
  /** Discard local edits and re-read from the server. */
  revert: () => Promise<void>;
}

type DocumentStore<Doc> = UseBoundStore<StoreApi<DocumentState<Doc>>>;

const stores = new Map<string, DocumentStore<unknown>>();

const storeKey = (kind: DocumentKind, id: string): string => `${kind}:${id}`;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error";

/**
 * A stale-write rejection. Both routers raise `ALREADY_EXISTS` with a message
 * naming the conflict; matching it lets the screen offer "reload" instead of a
 * generic failure the user can only retry into the same wall.
 */
const isConflict = (error: unknown): boolean => {
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes("optimistic concurrency") ||
    message.includes("modified since") ||
    message.includes("modified concurrently")
  );
};

function createDocumentStore<Doc>(
  kind: DocumentKind,
  id: string
): DocumentStore<Doc> {
  const backend = documentBackend<Doc>(kind);

  /**
   * The write currently on the wire, if any.
   *
   * Saves must not overlap. The user's Save button and the agent's
   * `ui_*_save` both land here, and two concurrent writes would carry the same
   * token — the server commits the first and rejects the second as a conflict,
   * which would surface to the user as "someone else changed this" for two
   * edits they made themselves.
   */
  let inFlight: Promise<void> | null = null;

  return create<DocumentState<Doc>>((set, get) => ({
    kind,
    id,
    doc: null,
    name: "",
    token: undefined,
    updatedAt: null,
    dirty: false,
    status: "idle",
    error: null,

    load: async () => {
      set({ status: "loading", error: null });
      try {
        const loaded = await backend.read(id);
        set({
          doc: loaded.doc,
          name: loaded.name,
          token: loaded.token,
          updatedAt: loaded.updatedAt,
          dirty: false,
          status: "idle",
          error: null
        });
      } catch (error) {
        set({ status: "error", error: errorMessage(error) });
      }
    },

    edit: (mutate) => {
      const current = get().doc;
      if (current === null) {
        return;
      }
      set({ doc: mutate(current), dirty: true });
    },

    rename: (name) => set({ name, dirty: true }),

    save: async () => {
      // Wait out any write already on the wire, then re-check: the earlier save
      // may well have persisted what this call was going to send.
      while (inFlight) {
        await inFlight;
      }
      const { doc, name, token, dirty } = get();
      if (doc === null || !dirty) {
        return;
      }
      if (!backend.writable) {
        throw new Error(`${kind} documents are read-only`);
      }

      set({ status: "saving", error: null });
      const write = (async () => {
        try {
          const saved = await backend.save(id, { doc, name, token });
          const after = get();
          // Only call the document clean if nothing changed while the write was
          // in flight. An agent edit landing mid-save would otherwise be marked
          // saved, disabling the Save button and losing the edit on reload.
          const settled = after.doc === doc && after.name === name;
          type NextFields = {
            token: typeof saved.token;
            updatedAt: typeof saved.updatedAt;
            status: "idle";
            name?: string;
            dirty?: boolean;
          };
          const next: NextFields = {
            // Adopt the server's token either way, so the follow-up save is
            // checked against the row we just wrote.
            token: saved.token,
            updatedAt: saved.updatedAt,
            status: "idle"
          };
          if (settled) {
            next.name = saved.name;
            next.dirty = false;
          }
          set(next);
        } catch (error) {
          set({
            status: isConflict(error) ? "conflict" : "error",
            error: errorMessage(error)
          });
        }
      })();

      inFlight = write.finally(() => {
        inFlight = null;
      });
      await inFlight;
    },

    revert: async () => {
      await get().load();
    }
  }));
}

/** The store for one document, created on first use and reused after. */
export function documentStore<Doc>(
  kind: DocumentKind,
  id: string
): DocumentStore<Doc> {
  const key = storeKey(kind, id);
  const existing = stores.get(key);
  if (existing) {
    return existing as DocumentStore<Doc>;
  }
  const created = createDocumentStore<Doc>(kind, id);
  stores.set(key, created as DocumentStore<unknown>);
  return created;
}

/** Drop a cached store — call when a document is deleted. */
export function disposeDocumentStore(kind: DocumentKind, id: string): void {
  stores.delete(storeKey(kind, id));
}

/** Test seam. */
export function resetDocumentStores(): void {
  stores.clear();
}
