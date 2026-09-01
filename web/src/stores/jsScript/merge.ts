/**
 * JS script merge adapter
 *
 * Teaches the generic per-unit merge engine about a JS script document:
 * `inputs[]`/`outputs[]` by port name and `tests[]` by test name are the
 * merge units; `code`, name, description, timeout and secrets are
 * last-write-wins scalars. A dirty body plus an external `set_code` is one
 * conflict; dirty code plus external `set_tests` is not.
 */
import type {
  DocumentMergeAdapter,
  MergeResult
} from "../documentMerge";
import { mergeByUnits } from "../documentMerge";

/** The slice of a JS script document the engine merges. */
export interface JsScriptMergeDoc {
  code: string;
  inputs: unknown[];
  outputs: unknown[];
  tests: unknown[];
  name: string;
  description: string;
  secrets: string[];
  timeoutSeconds?: number;
}

const byName = (unit: unknown): string =>
  String((unit as { name?: unknown }).name ?? "");

const jsScriptMergeAdapter: DocumentMergeAdapter<JsScriptMergeDoc> = {
  collections: [
    {
      kind: "input",
      read: (doc) => doc.inputs,
      write: (doc, items) => ({ ...doc, inputs: items }),
      unitId: byName,
      unitLabel: (unit) => `input ${byName(unit)}`
    },
    {
      kind: "output",
      read: (doc) => doc.outputs,
      write: (doc, items) => ({ ...doc, outputs: items }),
      unitId: byName,
      unitLabel: (unit) => `output ${byName(unit)}`
    },
    {
      kind: "test",
      read: (doc) => doc.tests,
      write: (doc, items) => ({ ...doc, tests: items }),
      unitId: byName,
      unitLabel: (unit) => `test ${byName(unit)}`
    }
  ],
  scalars: [
    {
      name: "code",
      read: (doc) => doc.code,
      write: (doc, value) => ({ ...doc, code: value as string })
    },
    {
      name: "name",
      read: (doc) => doc.name,
      write: (doc, value) => ({ ...doc, name: value as string })
    },
    {
      name: "description",
      read: (doc) => doc.description,
      write: (doc, value) => ({ ...doc, description: value as string })
    },
    {
      name: "secrets",
      read: (doc) => doc.secrets,
      write: (doc, value) => ({ ...doc, secrets: value as string[] })
    },
    {
      name: "timeoutSeconds",
      read: (doc) => doc.timeoutSeconds,
      write: (doc, value) => ({
        ...doc,
        timeoutSeconds: value as number | undefined
      })
    }
  ],
  unitsTouchedByOp: (op): { kind: string; unitId?: string }[] => {
    switch (op.tool) {
      case "set_ports":
        return [{ kind: "input" }, { kind: "output" }];
      case "set_tests":
        return [{ kind: "test" }];
      case "set_code":
        return [{ kind: "field", unitId: "code" }];
      case "set_meta":
        return [
          { kind: "field", unitId: "name" },
          { kind: "field", unitId: "description" },
          { kind: "field", unitId: "secrets" },
          { kind: "field", unitId: "timeoutSeconds" }
        ];
      default:
        return [];
    }
  }
};

/**
 * Merge one external JS script write into the dirty draft.
 */
export function mergeJsScriptDocuments(
  base: JsScriptMergeDoc,
  draft: JsScriptMergeDoc,
  server: JsScriptMergeDoc,
  ops?: import("@nodetool-ai/protocol").DocumentOp[]
): MergeResult<JsScriptMergeDoc> {
  return mergeByUnits(base, draft, server, jsScriptMergeAdapter, { ops });
}
