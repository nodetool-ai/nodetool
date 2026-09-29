import { anyGameDocument, gameAuthoring, type AnyGameDocument } from "@nodetool-ai/protocol";
import { z } from "zod";
import { applyAnyGameOps, gameAuthoringBaseline, reconcileGameAuthoring, type AnyGameDocumentOp, type GameAuthoringConflict } from "@nodetool-ai/game-runtime";
import type { DocumentMergeAdapter } from "../documentMerge";

const { overrides: _overrides, suppressions: _suppressions, detached: _detached, ...definitionShape } = gameAuthoring.shape;
const definitionSchema = z.strictObject(definitionShape);

/** Merge accepted construction separately from manual ownership records. */
export function authoringMergeScalars<Document extends AnyGameDocument>(): NonNullable<DocumentMergeAdapter<Document>["scalars"]> {
  return [
    {
      name: "authoringDefinition",
      read: (document) => {
        if (!document.authoring) { return undefined; }
        const { overrides: _overrides, suppressions: _suppressions, detached: _detached, ...definition } = document.authoring;
        return definition;
      },
      write: (document, value) => {
        if (value === undefined) { return { ...document, authoring: undefined }; }
        const definition = definitionSchema.parse(value);
        return { ...document, authoring: gameAuthoring.parse({ ...document.authoring, ...definition }) };
      }
    },
    ...(["overrides", "suppressions", "detached"] as const).map((field) => ({
      name: `authoring.${field}`,
      read: (document: Document) => document.authoring?.[field],
      write: (document: Document, value: unknown): Document => {
        if (!document.authoring) { return document; }
        return { ...document, authoring: gameAuthoring.parse({ ...document.authoring, [field]: value ?? [] }) };
      }
    }))
  ];
}

/** Reapply local ownership against the accepted generated baseline after a rebuild. */
export function rebaseGameAuthoringEdits(current: AnyGameDocument, server: AnyGameDocument): {
  document: AnyGameDocument;
  conflicts: readonly GameAuthoringConflict[];
} {
  if (!current.authoring || !server.authoring) { throw new Error("Rebasing construction requires retained authoring"); }
  const generated = anyGameDocument.parse({ ...gameAuthoringBaseline(server), revision: server.revision, authoring: server.authoring });
  const result = reconcileGameAuthoring(current, generated);
  if (result.conflicts.length > 0) { return result; }
  const ops: AnyGameDocumentOp[] = result.document.schemaVersion === 3
    ? [{ op: "set_document", document: result.document }] : [{ op: "set_document", document: result.document }];
  return { document: applyAnyGameOps(server, ops), conflicts: [] };
}
