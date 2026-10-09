import { memo } from "react";
import { gameScriptParamValueOf, type AnyGameDocument, type GameScriptParam, type GameScriptParamValue } from "@nodetool-ai/protocol";
import type { GameValidationIssue } from "@nodetool-ai/game-runtime";

import { Caption, FlexColumn, SPACING } from "../../../ui_primitives";
import SchemaFields from "../SchemaFields";
import type { FieldSchema } from "../schemaForm";

export type ScriptParamEdits = Record<string, GameScriptParamValue | null>;

/** The SchemaFields schema for one declared script parameter. */
export function scriptParamFieldSchema(param: GameScriptParam): FieldSchema {
  switch (param.type) {
    case "number": return { type: param.integer ? "integer" : "number", minimum: param.minimum, maximum: param.maximum };
    case "boolean": return { type: "boolean" };
    case "color": return { type: "string", pattern: "^#[0-9a-fA-F]{6}$" };
    case "enum": return { enum: param.options };
    case "entity": return { type: "string", format: "game-entity" };
    case "asset": return { type: "string", format: "game-asset", assetKind: param.kind };
    case "vector": {
      const axis: FieldSchema = { type: "number", minimum: param.minimum, maximum: param.maximum };
      const keys = param.dimensions === 3 ? ["x", "y", "z"] : ["x", "y"];
      return { type: "object", properties: Object.fromEntries(keys.map((key) => [key, axis])), required: keys };
    }
  }
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
      return <FlexColumn key={name} gap={SPACING.micro} sx={{ width: "100%", minWidth: 0 }}>
        <SchemaFields schema={scriptParamFieldSchema(param)} value={gameScriptParamValueOf(param, stored) ?? ""} path={name}
          issuePath={[...issuePath, "values", name]} issues={issues} assets={assets} entities={entities}
          onChange={(next) => onValues(scriptParamEdit(param, name, next))} />
        {param.description && <Caption>{param.description}</Caption>}
      </FlexColumn>;
    })}
  </FlexColumn>;
}

export default memo(ScriptParamsEditor);
