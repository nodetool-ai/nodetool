/**
 * Script merge adapter
 *
 * Teaches the generic per-unit merge engine about a script document:
 * `cast[]` by speaker id and `sections[]` by section id are the merge units.
 * A section's `lines` merge per line inside the section, and a line's
 * `takes` per take inside the line — so a take added on the server to a
 * line whose text is dirty is not a conflict (takes and text are separate
 * fields of the unit). Title and link fields are last-write-wins scalars.
 */
import type { DocumentOp } from "@nodetool-ai/protocol";
import type {
  DocumentMergeAdapter,
  MergeResult
} from "../documentMerge";
import { mergeByUnits } from "../documentMerge";

/** The slice of a script draft the engine merges. */
export interface ScriptMergeDoc {
  title: string;
  cast: unknown[];
  sections: unknown[];
  timelineId: string | null;
  storyboardId: string | null;
}

const named = (unit: unknown): { id: string; name?: string } =>
  unit as { id: string; name?: string };

const lineOf = (unit: unknown): { id: string; text?: string } =>
  unit as { id: string; text?: string };

export const scriptMergeAdapter: DocumentMergeAdapter<ScriptMergeDoc> = {
  collections: [
    {
      kind: "speaker",
      read: (doc) => doc.cast,
      write: (doc, cast) => ({ ...doc, cast }),
      unitId: (unit) => named(unit).id,
      unitLabel: (unit) => named(unit).name || named(unit).id
    },
    {
      kind: "section",
      read: (doc) => doc.sections,
      write: (doc, sections) => ({ ...doc, sections }),
      unitId: (unit) => named(unit).id,
      unitLabel: (unit) => named(unit).name || "Section",
      unitFields: [
        {
          field: "lines",
          itemId: (item) => lineOf(item).id,
          // Lines are merge units in their own right: a refused line is
          // listed and accepted per line, never by replacing its section.
          conflictKind: "line",
          itemLabel: (item) => {
            const line = lineOf(item);
            const text = typeof line.text === "string" ? line.text : "";
            return text ? `Line "${text.slice(0, 40)}"` : `Line ${line.id}`;
          },
          // Takes and currentTakeId are separate from text: voicing never
          // contests writing, and the pointer must survive a dirty line.
          fields: [
            {
              field: "takes",
              itemId: (item) => (item as { id: string }).id,
              conflictKind: "take",
              itemLabel: (item) => `Take ${(item as { id: string }).id}`
            },
            { field: "currentTakeId" }
          ]
        }
      ]
    }
  ],
  scalars: [
    {
      name: "title",
      read: (doc) => doc.title,
      write: (doc, value) => ({ ...doc, title: value as string })
    },
    {
      name: "timelineId",
      read: (doc) => doc.timelineId,
      write: (doc, value) => ({ ...doc, timelineId: value as string | null })
    },
    {
      name: "storyboardId",
      read: (doc) => doc.storyboardId,
      write: (doc, value) => ({ ...doc, storyboardId: value as string | null })
    }
  ],
  unitsTouchedByOp: (op: DocumentOp): { kind: string; unitId?: string }[] => {
    const input = (op.input ?? {}) as Record<string, unknown>;
    const target =
      [input["line_id"], input["target"], input["id"]].find(
        (v) => typeof v === "string"
      ) ?? undefined;
    switch (op.tool) {
      case "set_line_text":
      case "set_line_speaker":
      case "remove_line":
        return typeof target === "string"
          ? [{ kind: "section.lines", unitId: target }]
          : [];
      case "append_take": {
        const takeId =
          typeof input["take_id"] === "string" ? input["take_id"] : undefined;
        return typeof takeId === "string"
          ? [{ kind: "section.lines.takes", unitId: takeId }]
          : [];
      }
      case "set_link":
        return [
          { kind: "field", unitId: "timelineId" },
          { kind: "field", unitId: "storyboardId" }
        ];
      case "set_speaker":
      case "set_speaker_voice":
      case "remove_speaker":
        return typeof target === "string"
          ? [{ kind: "speaker", unitId: target }]
          : [];
      default:
        // add_* resolve through existence; reorder changes no content.
        return [];
    }
  }
};

/**
 * Merge one external script write into the dirty draft.
 */
export function mergeScriptDocuments(
  base: ScriptMergeDoc,
  draft: ScriptMergeDoc,
  server: ScriptMergeDoc,
  ops?: DocumentOp[]
): MergeResult<ScriptMergeDoc> {
  return mergeByUnits(base, draft, server, scriptMergeAdapter, { ops });
}
