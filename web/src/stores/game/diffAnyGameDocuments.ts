import type { AnyGameDocument, GameDocument } from "@nodetool-ai/protocol";
import type { AnyGameDocumentOp, GameDocumentOp } from "@nodetool-ai/game-runtime";
import { diffGameDocuments } from "./diffGameDocuments";

export function diffAnyGameDocuments(from: GameDocument, to: GameDocument): GameDocumentOp[];
export function diffAnyGameDocuments(from: AnyGameDocument, to: AnyGameDocument): AnyGameDocumentOp[];
export function diffAnyGameDocuments(from: AnyGameDocument, to: AnyGameDocument): AnyGameDocumentOp[] {
  if (from.schemaVersion !== 3 && to.schemaVersion !== 3) {
    return diffGameDocuments(from, to);
  }
  if (from.schemaVersion !== to.schemaVersion) {
    throw new Error("A game draft cannot change dimension");
  }
  if (from.schemaVersion === 3 && to.schemaVersion === 3) {
    return JSON.stringify(from) === JSON.stringify(to) ? [] : [{ op: "set_document", document: to }];
  }
  throw new Error("A game draft cannot change dimension");
}
