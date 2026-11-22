/**
 * When the cloud window closes because its account signed out or changed,
 * every open cloud document writes the edits it holds in memory to the local
 * drafts store before the desktop app closes the window (FR11, AC77).
 *
 * Each drafts hook registers a flush while its document is open. The cloud
 * window's bridge runs them all when the desktop app announces the close.
 *
 * Thread affinity: the renderer's event loop.
 */
const flushes = new Set<() => Promise<unknown>>();

/** Registers a flush for an open document. Returns the function that removes it. */
export function registerCloudWindowFlush(flush: () => Promise<unknown>): () => void {
  flushes.add(flush);
  return () => {
    flushes.delete(flush);
  };
}

/** Runs every registered flush. Resolves once all have settled, whatever their outcome. */
export async function flushCloudWindow(): Promise<void> {
  await Promise.allSettled([...flushes].map((flush) => flush()));
}
