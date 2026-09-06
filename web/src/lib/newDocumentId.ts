// newDocumentId.ts
// -----------------------------------------------------------------
// Mints a document id on the client, at creation time.
//
// Documents used to get their id from the server's create response, which left
// a window where a document existed in the UI with no id — not addressable by
// the `ui_*` agent tools, not usable as a workspace tab ref. Minting up front
// closes that window and makes create idempotent: the routers treat a create
// carrying an existing id as a no-op returning that row, so a retry can't
// duplicate the document.
//
// Format matches the server's `createTimeOrderedUuid`
// (packages/models/src/base-model.ts) — a v4 UUID with the dashes stripped —
// so client-minted and server-minted ids are indistinguishable in the DB.
//
// `crypto.randomUUID` is secure-context-only; `cryptoUUIDPolyfill.ts`
// (imported first in `index.tsx`) installs a spec-correct v4 fallback for
// plain-http origins, so callers can use it unguarded.
// -----------------------------------------------------------------

export const newDocumentId = (): string =>
  crypto.randomUUID().replace(/-/g, "");
