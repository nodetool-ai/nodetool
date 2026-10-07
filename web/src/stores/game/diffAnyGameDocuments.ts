import type { AnyGameDocument, GameDocument } from "@nodetool-ai/protocol";
import type { AnyGameDocumentOp, GameDocumentOp } from "@nodetool-ai/game-runtime";
import { diffGameDocuments } from "./diffGameDocuments";
import { diffGameDocuments3D } from "./diffGameDocuments3D";
import { sameGameAuthoringDefinitions } from "./diffGameOwnership";

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
    if (!sameGameAuthoringDefinitions(from, to)) {
      return [{ op: "set_document", document: to }];
    }
    return diffGameDocuments3D(from, to);
  }
  throw new Error("A game draft cannot change dimension");
}
