import { memo, type ReactNode } from "react";
import { gameScriptParamValueOf, type AnyGameDocument, type GameScriptParam, type GameScriptParamValue } from "@nodetool-ai/protocol";
import type { GameValidationIssue } from "@nodetool-ai/game-runtime";

import { Caption, FlexColumn, InspectorFieldRow, InspectorSelect, SPACING } from "../../../ui_primitives";
import SchemaFields from "../SchemaFields";
import type { FieldSchema } from "../schemaForm";

export type ScriptParamEdits = Record<string, GameScriptParamValue | null>;

type ValueParam = Exclude<GameScriptParam, { type: "entity" | "asset" }>;

/** The SchemaFields schema for a declared parameter that is not a reference. */
export function scriptParamFieldSchema(param: ValueParam): FieldSchema {
  switch (param.type) {
    case "number": return { type: param.integer ? "integer" : "number", minimum: param.minimum, maximum: param.maximum };
    case "boolean": return { type: "boolean" };
    case "color": return { type: "string", pattern: "^#[0-9a-fA-F]{6}$" };
    case "enum": return { enum: param.options };
    case "vector": {
      const axis: FieldSchema = { type: "number", minimum: param.minimum, maximum: param.maximum };
      const keys = param.dimensions === 3 ? ["x", "y", "z"] : ["x", "y"];
      return { type: "object", properties: Object.fromEntries(keys.map((key) => [key, axis])), required: keys };
    }
  }
}

function paramLabel(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}

function issueAt(issues: readonly GameValidationIssue[], path: readonly (string | number)[]): string | undefined {
  return issues.find((issue) => issue.path.length === path.length && issue.path.every((part, index) => part === path[index]))?.message;
}

/**
 * Converts one field change into a `set_script_params` values patch. An empty reference
 * stores null, and a value equal to the declared default clears the stored value.
 */
export function scriptParamEdit(param: GameScriptParam, name: string, next: unknown): ScriptParamEdits {
  const value = (param.type === "entity" || param.type === "asset") && next === "" ? null : next as GameScriptParamValue | null;
  const fallback = gameScriptParamValueOf(param, undefined);
  return { [name]: JSON.stringify(value) === JSON.stringify(fallback) ? null : value };
}

interface ScriptParamsEditorProps {
  readonly params: Readonly<Record<string, GameScriptParam>>;
  readonly values?: Readonly<Record<string, GameScriptParamValue>>;
  readonly assets: AnyGameDocument["assets"];
  /** Entities of the behavior's scene, which entity params may reference. */
  readonly entities: readonly { readonly id: string; readonly name?: string }[];
  /** Document path of the behavior, for validation issues. */
  readonly issuePath?: readonly (string | number)[];
  readonly issues?: readonly GameValidationIssue[];
  readonly onValues: (values: ScriptParamEdits) => void;
}

function ScriptParamsEditor({ params, values, assets, entities, issuePath = [], issues = [], onValues }: ScriptParamsEditorProps) {
  return <FlexColumn gap={SPACING.xs} sx={{ width: "100%", minWidth: 0 }}>
    {Object.entries(params).map(([name, param]) => {
      const stored = values !== undefined && Object.hasOwn(values, name) ? values[name] : undefined;
      const value = gameScriptParamValueOf(param, stored);
      const valuePath = [...issuePath, "values", name];
      let field: ReactNode;
      if (param.type === "entity" || param.type === "asset") {
        const current = String(value ?? "");
        const options = param.type === "entity"
          ? entities.map((entity) => ({ value: entity.id, label: entity.name || entity.id }))
          : Object.entries(assets).filter(([, binding]) => !param.kind || binding.mediaKind === param.kind).map(([slot]) => ({ value: slot, label: slot }));
        if (current && !options.some((option) => option.value === current)) { options.unshift({ value: current, label: current }); }
        const error = issueAt(issues, valuePath) ?? issueAt(issues, [...issuePath, "params", name, "default"]);
        field = <FlexColumn gap={SPACING.xs} sx={{ width: "100%", minWidth: 0 }}>
          <InspectorFieldRow label={paramLabel(name)}><InspectorSelect grow label={paramLabel(name)} value={current}
            options={[{ value: "", label: "None" }, ...options]} onChange={(next) => onValues(scriptParamEdit(param, name, next))} /></InspectorFieldRow>
          {error && <Caption color="error">{error}</Caption>}
        </FlexColumn>;
      } else {
        field = <SchemaFields schema={scriptParamFieldSchema(param)} value={value} path={name} issuePath={valuePath} issues={issues}
          onChange={(next) => onValues(scriptParamEdit(param, name, next))} />;
      }
      return <FlexColumn key={name} gap={SPACING.micro} sx={{ width: "100%", minWidth: 0 }}>
        {field}
        {param.description && <Caption>{param.description}</Caption>}
      </FlexColumn>;
    })}
  </FlexColumn>;
}

export default memo(ScriptParamsEditor);
