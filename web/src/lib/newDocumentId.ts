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
// -----------------------------------------------------------------

/**
 * `crypto.randomUUID` needs a secure context. It is present in every browser
 * this app supports over https/localhost, but not on a plain-http LAN origin,
 * which self-hosted installs do hit — hence the fallback rather than a throw.
 */
const randomUuid = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const newDocumentId = (): string => randomUuid().replace(/-/g, "");
