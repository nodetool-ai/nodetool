import type { AnyGameDocument } from "@nodetool-ai/protocol";
import type { DocumentMergeAdapter } from "../documentMerge";
import { gameMergeAdapter } from "./merge";
import { gameMergeAdapter3D } from "./merge3D";

function widen<T extends AnyGameDocument>(adapter: DocumentMergeAdapter<T>, narrow: (doc: AnyGameDocument) => T): DocumentMergeAdapter<AnyGameDocument> {
  return {
    collections: adapter.collections.map((collection) => ({ ...collection,
      read: (doc) => collection.read(narrow(doc)),
      write: (doc, units) => collection.write(narrow(doc), units)
    })),
    scalars: adapter.scalars?.map((scalar) => ({ ...scalar,
      read: (doc) => scalar.read(narrow(doc)),
      write: (doc, value) => scalar.write(narrow(doc), value)
    }))
  };
}

const legacy = widen(gameMergeAdapter, (doc) => {
  if (doc.schemaVersion === 3) { throw new Error("Game dimension cannot change during a merge"); }
  return doc;
});
const spatial = widen(gameMergeAdapter3D, (doc) => {
  if (doc.schemaVersion !== 3) { throw new Error("Game dimension cannot change during a merge"); }
  return doc;
});

/** Select one dimension's fields so merges cannot introduce unsupported components. */
export function anyGameMergeAdapter(document: AnyGameDocument): DocumentMergeAdapter<AnyGameDocument> {
  return document.schemaVersion === 3 ? spatial : legacy;
}

export function acceptServerAnyGameUnit(current: AnyGameDocument, server: AnyGameDocument, kind: string, id: string): AnyGameDocument {
  const adapter = anyGameMergeAdapter(current);
  const collection = adapter.collections.find((entry) => entry.kind === kind);
  if (collection) {
    const units = collection.read(current) ?? [];
    const replacement = (collection.read(server) ?? []).find((unit) => collection.unitId(unit) === id);
    const index = units.findIndex((unit) => collection.unitId(unit) === id);
    const filtered = units.filter((unit) => collection.unitId(unit) !== id);
    if (replacement) { filtered.splice(index < 0 ? filtered.length : index, 0, replacement); }
    return collection.write(current, filtered);
  }
  const scalar = adapter.scalars?.find((entry) => entry.name === id);
  return scalar ? scalar.write(current, scalar.read(server)) : current;
}
