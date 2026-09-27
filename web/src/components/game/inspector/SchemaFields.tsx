import { useEffect, useState } from "react";
import type { GameDocument } from "@nodetool-ai/protocol/game.js";
import type { GameValidationIssue } from "@nodetool-ai/game-runtime";

import NumberInput from "../../inputs/NumberInput";
import { Caption, Checkbox, CollapsibleSection, EditorButton, FlexColumn, FlexRow, LabeledSwitch, SelectField, SPACING, TextInput } from "../../ui_primitives";
import type { FieldSchema } from "./schemaForm";
import { schemaDefault, schemaVariant } from "./schemaForm";

interface SchemaFieldsProps {
  schema: FieldSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  path?: string;
  issuePath?: readonly (string | number)[];
  issues?: readonly GameValidationIssue[];
  assets?: GameDocument["assets"];
  collisionLayers?: readonly string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function fieldError(issues: readonly GameValidationIssue[], path: readonly (string | number)[]): string | undefined {
  return issues.find((issue) => issue.path.length === path.length && issue.path.every((part, index) => part === path[index]))?.message;
}

function assetKind(path: string): "image" | "audio" | "font" | undefined {
  if (!path.endsWith("assetId") || path.startsWith("assets.")) return undefined;
  if (path.includes("music") || path.includes("audioSource")) return "audio";
  if (path.includes("font")) return "font";
  return "image";
}

function trackCurve(easing: string): string {
  switch (easing) {
    case "easeIn": return "0,32 8,31 16,28 24,23 32,16";
    case "easeOut": return "0,32 8,24 16,19 24,17 32,16";
    case "easeInOut": return "0,32 8,30 16,24 24,18 32,16";
    default: return "0,32 32,16";
  }
}

function StringField({ label, value, schema, error, onChange }: { label: string; value: string; schema: FieldSchema; error?: string; onChange: (value: string) => void }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const validLength = local.length >= (schema.minLength ?? 0);
  const validPattern = !schema.pattern || new RegExp(schema.pattern).test(local);
  const localError = !validLength ? `Enter at least ${schema.minLength} character${schema.minLength === 1 ? "" : "s"}` : !validPattern ? "Invalid format" : undefined;
  return <TextInput label={label} size="small" type={schema.pattern === "^#[0-9a-fA-F]{6}$" || /^#[0-9a-fA-F]{6}$/.test(local) ? "color" : "text"}
    value={local} errorMessage={localError ?? error} onChange={(event) => {
      const next = event.target.value;
      setLocal(next);
      if (next.length >= (schema.minLength ?? 0) && (!schema.pattern || new RegExp(schema.pattern).test(next))) onChange(next);
    }} />;
}

function NumberField({ label, value, schema, degrees, error, id, onChange }: { label: string; value: number; schema: FieldSchema; degrees: boolean; error?: string; id: string; onChange: (value: number) => void }) {
  const displayed = degrees ? Math.round(value * 180 / Math.PI * 100) / 100 : value;
  const [local, setLocal] = useState(displayed);
  useEffect(() => setLocal(displayed), [displayed]);
  const actual = degrees ? local * Math.PI / 180 : local;
  const invalid = (schema.minimum !== undefined && actual < schema.minimum) || (schema.exclusiveMinimum !== undefined && actual <= schema.exclusiveMinimum) ||
    (schema.maximum !== undefined && actual > schema.maximum) || (schema.type === "integer" && !Number.isInteger(actual));
  return <FlexColumn gap={SPACING.xs}><NumberInput nodeId="game-inspector" id={id} name={label}
    value={local} inputType={schema.type === "integer" ? "int" : "float"}
    onChange={(_, next) => {
      setLocal(next);
      const converted = degrees ? next * Math.PI / 180 : next;
      if (Number.isFinite(converted) && (schema.minimum === undefined || converted >= schema.minimum) &&
        (schema.exclusiveMinimum === undefined || converted > schema.exclusiveMinimum) &&
        (schema.maximum === undefined || converted <= schema.maximum) && (schema.type !== "integer" || Number.isInteger(converted))) onChange(converted);
    }} />
    {(invalid || error) && <Caption color="error">{invalid ? "Value is outside the allowed range" : error}</Caption>}
  </FlexColumn>;
}

export default function SchemaFields({ schema, value, onChange, path = "", issuePath = [], issues = [], assets, collisionLayers }: SchemaFieldsProps) {
  const selected = schemaVariant(schema, value);
  if (selected !== schema) {
    const variants = schema.oneOf ?? schema.anyOf ?? [];
    const discriminator = Object.entries(selected.properties ?? {}).find(([, child]) => child.const !== undefined)?.[0];
    return <FlexColumn gap={SPACING.sm}>
      {discriminator && variants.length > 1 && <SelectField label={discriminator} value={String(asRecord(value)[discriminator] ?? "")}
        options={variants.map((option) => ({ value: String(option.properties?.[discriminator]?.const ?? ""), label: String(option.properties?.[discriminator]?.const ?? "") }))}
        onChange={(next) => {
          const variant = variants.find((option) => option.properties?.[discriminator]?.const === next);
          if (variant) {
            const defaults = asRecord(schemaDefault(variant));
            onChange(path.includes("tracks.") && (next === "scaleX" || next === "scaleY")
              ? { ...defaults, from: 1, to: 1 } : defaults);
          }
        }} />}
      <SchemaFields schema={selected} value={value} onChange={onChange} path={path} issuePath={issuePath} issues={issues} assets={assets} collisionLayers={collisionLayers} />
    </FlexColumn>;
  }
  if (schema.type === "object" || schema.properties) {
    const record = asRecord(value);
    return <FlexColumn gap={SPACING.sm}>
      {Object.entries(schema.properties ?? {}).filter(([key]) => key !== "kind" && key !== "property").map(([key, child]) => {
        const childValue = record[key];
        const label = path ? `${path}.${key}` : key;
        const childPath = [...issuePath, key];
        if (childValue === undefined) return <EditorButton key={key} onClick={() => onChange({ ...record, [key]: schemaDefault(child) })}>Add {key}</EditorButton>;
        const field = <SchemaFields schema={child} value={childValue} path={label} issuePath={childPath} issues={issues} assets={assets} collisionLayers={collisionLayers}
          onChange={(next) => onChange({ ...record, [key]: next })} />;
        const optional = !schema.required?.includes(key);
        return child.type === "object" || child.properties || child.type === "array"
          ? <CollapsibleSection key={key} title={key} compact>{field}{optional && <EditorButton onClick={() => {
            const copy = { ...record }; delete copy[key]; onChange(copy);
          }}>Remove {key}</EditorButton>}</CollapsibleSection>
          : <FlexRow key={key} gap={SPACING.xs} align="center" sx={{ minWidth: 0 }}>{field}{optional && <EditorButton onClick={() => {
            const copy = { ...record }; delete copy[key]; onChange(copy);
          }}>Remove</EditorButton>}</FlexRow>;
      })}
      {fieldError(issues, issuePath) && <Caption color="error">{fieldError(issues, issuePath)}</Caption>}
    </FlexColumn>;
  }
  if (schema.type === "array") {
    const items = Array.isArray(value) ? value : [];
    const fixedLength = Boolean(schema.prefixItems?.length);
    return <FlexColumn gap={SPACING.sm}>
      {items.map((item, index) => <FlexColumn key={typeof asRecord(item).id === "string" ? String(asRecord(item).id) : index} gap={SPACING.xs}>
        {path.endsWith("tracks") && <svg role="img" aria-label={`${String(asRecord(item).easing ?? "linear")} curve`} width="64" height="40" viewBox="0 0 40 40">
          <polyline points={trackCurve(String(asRecord(item).easing ?? "linear"))} fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>}
        <SchemaFields schema={schema.prefixItems?.[index] ?? schema.items ?? { type: "string" }} value={item} path={`${path}.${index}`}
          issuePath={[...issuePath, index]} issues={issues} assets={assets} collisionLayers={collisionLayers}
          onChange={(next) => onChange(items.map((entry, position) => position === index ? next : entry))} />
        {!fixedLength && <FlexRow gap={SPACING.xs}>
          <EditorButton disabled={index === 0} onClick={() => {
            const copy = [...items]; [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]]; onChange(copy);
          }}>Move up</EditorButton>
          <EditorButton disabled={index === items.length - 1} onClick={() => {
            const copy = [...items]; [copy[index + 1], copy[index]] = [copy[index], copy[index + 1]]; onChange(copy);
          }}>Move down</EditorButton>
          <EditorButton disabled={items.length <= (schema.minItems ?? 0)} onClick={() => onChange(items.filter((_, position) => position !== index))}>Remove</EditorButton>
        </FlexRow>}
      </FlexColumn>)}
      {!fixedLength && <EditorButton disabled={items.length >= (schema.maxItems ?? Infinity)} onClick={() => onChange([...items, schemaDefault(schema.items ?? { type: "string" })])}>Add item</EditorButton>}
      {fieldError(issues, issuePath) && <Caption color="error">{fieldError(issues, issuePath)}</Caption>}
    </FlexColumn>;
  }
  const error = fieldError(issues, issuePath);
  if ((path.endsWith("collider2d.category") || path.endsWith("collider2d.mask")) && typeof value === "number") {
    return <FlexColumn gap={SPACING.xs}>
      <Caption>{path.endsWith("category") ? "Category" : "Mask"}</Caption>
      <FlexRow gap={SPACING.xs} sx={{ flexWrap: "wrap" }}>
        {Array.from({ length: 32 }, (_, bit) => <Checkbox key={bit} compact size="small" label={collisionLayers?.[bit] ?? String(bit + 1)}
          checked={((value >>> bit) & 1) === 1} onChange={() => onChange(((value ^ (1 << bit)) >>> 0))}
          title={`Bit ${bit + 1}`} />)}
      </FlexRow>
      {error && <Caption color="error">{error}</Caption>}
    </FlexColumn>;
  }
  if (schema.enum) return <FlexColumn gap={SPACING.xs}><SelectField label={path} value={String(value ?? "")}
    options={schema.enum.map((option) => ({ value: option, label: String(option) }))}
    onChange={(next) => onChange(schema.enum?.find((option) => String(option) === next) ?? next)} />
    {error && <Caption color="error">{error}</Caption>}</FlexColumn>;
  if (schema.type === "boolean") return <FlexColumn gap={SPACING.xs}><LabeledSwitch label={path} checked={Boolean(value)} onChange={onChange} />
    {error && <Caption color="error">{error}</Caption>}</FlexColumn>;
  if (schema.type === "number" || schema.type === "integer") {
    const degrees = path.endsWith("transform2d.rotation");
    return <NumberField label={degrees ? "Rotation (degrees)" : path} value={typeof value === "number" ? value : 0} schema={schema}
      degrees={degrees} error={error} id={issuePath.join(".")} onChange={onChange} />;
  }
  if (schema.type === "string") {
    const kind = assetKind(path);
    if (kind && assets) {
      const slots = Object.entries(assets).filter(([, binding]) => binding.mediaKind === kind).map(([slot]) => slot);
      const current = typeof value === "string" ? value : "";
      if (current && !slots.includes(current)) slots.unshift(current);
      return <FlexColumn gap={SPACING.xs}><SelectField label={path} value={current} options={slots.map((slot) => ({ value: slot, label: slot }))}
        onChange={onChange} />{error && <Caption color="error">{error}</Caption>}</FlexColumn>;
    }
    return <StringField label={path} value={typeof value === "string" ? value : ""} schema={schema} error={error} onChange={onChange} />;
  }
  return <Caption>{path}: unsupported field</Caption>;
}
