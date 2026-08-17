/**
 * Document cast registry — the set of document-editor demo recordings Remotion
 * can render, one per document type. Sibling to `registry.ts` (graph),
 * `chatRegistry.ts` (chat) and `timelineRegistry.ts` (timeline).
 */
import { docCasts, type DocDemoCast } from "@web-demo";

export const listDocCasts = (): DocDemoCast[] => docCasts;

export const getDocCast = (id: string): DocDemoCast => {
  const cast = docCasts.find((c) => c.id === id);
  if (!cast) throw new Error(`Unknown document cast id: ${id}`);
  return cast;
};
