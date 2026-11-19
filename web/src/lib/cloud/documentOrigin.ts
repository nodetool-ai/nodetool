/**
 * Where an open document lives (technical design, "Cloud tRPC client";
 * WP1.15). A local document is on the server this app talks to. A cloud
 * document is on a cloud server, for one account, and reaches it through the
 * desktop app's cloud client.
 */
export type DocumentOrigin =
  | { kind: "local" }
  | { kind: "cloud"; server: string; account: string };

export const LOCAL_ORIGIN: DocumentOrigin = { kind: "local" };

export function isSameOrigin(a: DocumentOrigin, b: DocumentOrigin): boolean {
  if (a.kind === "local" || b.kind === "local") {
    return a.kind === b.kind;
  }
  return a.server === b.server && a.account === b.account;
}

/**
 * A query key for a document of this origin. A local key stays as it is, so
 * existing caches and invalidations keep working. A cloud key starts with
 * the server and the account, so a local and a cloud document with the same
 * id, or two accounts' documents, never share a cache entry (TC124).
 */
export function originQueryKey<K extends readonly unknown[]>(
  origin: DocumentOrigin,
  key: K
): readonly unknown[] {
  return origin.kind === "local" ? key : ["cloud", origin.server, origin.account, ...key];
}
