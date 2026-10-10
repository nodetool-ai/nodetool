import { useEffect, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import type { AnyGameDocument } from "@nodetool-ai/protocol";
import type { GameValidationIssue } from "@nodetool-ai/game-runtime";

import { Box, Caption, Checkbox, CollapsibleSection, CONTROL, EditorButton, FlexColumn, FlexRow, InspectorFieldRow, InspectorSelect, InspectorToggleRow, InspectorValueInput, Label, SPACING, TextInput, ToolbarIconButton, TYPOGRAPHY } from "../../ui_primitives";
import type { FieldSchema } from "./schemaForm";
import { schemaDefault, schemaVariant } from "./schemaForm";
import { COMPONENT_SECTION_SX } from "./componentSection";

interface SchemaFieldsProps {
  schema: FieldSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  path?: string;
  issuePath?: readonly (string | number)[];
  issues?: readonly GameValidationIssue[];
  assets?: AnyGameDocument["assets"];
  collisionLayers?: readonly string[];
  /** Render this object's nested objects as full-width component sections, as in an engine inspector. */
  componentSections?: boolean;
}

const FIELD_WIDTH = { width: "100%", minWidth: 0 } as const;
const ADD_FIELD_ROW_SX = { flexWrap: "wrap", pt: SPACING.xs } as const;
const ADD_COMPONENT_ROW_SX = { flexWrap: "wrap", p: SPACING.md, borderTop: 1, borderColor: "divider" } as const;

function isObjectSchema(schema: FieldSchema): boolean {
  return schema.type === "object" || Boolean(schema.properties);
}

/** A required x/y or x/y/z number object renders as one row instead of a section. */
function isVectorSchema(schema: FieldSchema): boolean {
  const keys = Object.keys(schema.properties ?? {});
  return (keys.length === 2 || keys.length === 3) && ["x", "y", "z"].slice(0, keys.length).every((key) =>
    keys.includes(key) && ["number", "integer"].includes(schema.properties?.[key]?.type ?? "") && Boolean(schema.required?.includes(key)));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function fieldError(issues: readonly GameValidationIssue[], path: readonly (string | number)[]): string | undefined {
  return issues.find((issue) => issue.path.length === path.length && issue.path.every((part, index) => part === path[index]))?.message;
}

function assetKind(path: string): "image" | "audio" | "font" | "model" | "collider" | undefined {
  if (!path.endsWith("assetId") || path.startsWith("assets.")) return undefined;
  if (path.includes("music") || path.includes("audioSource")) return "audio";
  if (path.includes("font")) return "font";
  if (path.includes("collider3d")) return "collider";
  if (path.includes("model")) return "model";
  return "image";
}

function fieldLabel(path: string): string {
  const parts = path.split(".");
  const key = parts.at(-1) ?? path;
  if (/^\d+$/.test(key)) return `Item ${Number(key) + 1}`;
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([a-z])([23])d\b/i, "$1 $2D")
    .replace(/^./, (letter) => letter.toUpperCase()).replace(/\bId\b/g, "ID").replace(/\bHud\b/g, "HUD");
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
  return <FlexColumn gap={SPACING.xs} sx={{ width: "100%" }}><InspectorFieldRow label={label}>
    <TextInput label={label} hideLabel compact type={schema.pattern === "^#[0-9a-fA-F]{6}$" || /^#[0-9a-fA-F]{6}$/.test(local) ? "color" : "text"}
    sx={{ minWidth: 0,
      "& .MuiInputBase-root:not(.MuiInputBase-multiline)": { minHeight: CONTROL.height.sm, height: CONTROL.height.sm },
      "& .MuiInputBase-input": { ...TYPOGRAPHY.sans.label, px: SPACING.md }
    }} value={local} onChange={(event) => {
      const next = event.target.value;
      setLocal(next);
      if (next.length >= (schema.minLength ?? 0) && (!schema.pattern || new RegExp(schema.pattern).test(next))) onChange(next);
    }} />
  </InspectorFieldRow>{(localError ?? error) && <Caption color="error">{localError ?? error}</Caption>}</FlexColumn>;
}

function NumberField({ label, value, schema, degrees, error, axis, onChange }: { label: string; value: number; schema: FieldSchema; degrees: boolean; error?: string; axis?: string; onChange: (value: number) => void }) {
  const displayed = degrees ? Math.round(value * 180 / Math.PI * 100) / 100 : value;
  const [local, setLocal] = useState(String(displayed));
  useEffect(() => setLocal(String(displayed)), [displayed]);
  const numeric = Number(local);
  const actual = degrees ? numeric * Math.PI / 180 : numeric;
  const invalid = local.trim() === "" || !Number.isFinite(actual) ||
    (schema.minimum !== undefined && actual < schema.minimum) || (schema.exclusiveMinimum !== undefined && actual <= schema.exclusiveMinimum) ||
    (schema.maximum !== undefined && actual > schema.maximum) || (schema.type === "integer" && !Number.isInteger(actual));
  const control = <FlexRow gap={SPACING.xs} align="center" sx={{ minWidth: 0, width: "100%" }}>
    <InspectorValueInput ariaLabel={label} value={local} unit={degrees ? "°" : undefined} size="medium" grow minWidth={axis ? CONTROL.height.xl : undefined} onCommit={(raw) => {
      setLocal(raw);
      const next = Number(raw);
      const converted = degrees ? next * Math.PI / 180 : next;
      if (raw.trim() !== "" && Number.isFinite(converted) && (schema.minimum === undefined || converted >= schema.minimum) &&
        (schema.exclusiveMinimum === undefined || converted > schema.exclusiveMinimum) &&
        (schema.maximum === undefined || converted <= schema.maximum) && (schema.type !== "integer" || Number.isInteger(converted))) onChange(converted);
    }} />
  </FlexRow>;
  return <FlexColumn gap={SPACING.xs} sx={FIELD_WIDTH}>
    {axis ? control : <InspectorFieldRow label={label}>{control}</InspectorFieldRow>}
    {(invalid || error) && <Caption color="error">{invalid ? "Value is outside the allowed range" : error}</Caption>}
  </FlexColumn>;
}

/**
 * Sets one field of a record. Picking a 3D collider layer also resets raw category and
 * mask to their defaults in the same edit, since a layered collider derives them and
 * validation rejects non-default raw bits beside a layer.
 */
function withColliderLayer(path: string, record: Record<string, unknown>, key: string, next: unknown): Record<string, unknown> {
  if (key === "layer" && path.endsWith("collider3d") && typeof next === "string") {
    return { ...record, layer: next, category: 1, mask: 0xffff };
  }
  return { ...record, [key]: next };
}

export default function SchemaFields({ schema, value, onChange, path = "", issuePath = [], issues = [], assets, collisionLayers, componentSections = false }: SchemaFieldsProps) {
  const selected = schemaVariant(schema, value);
  if (selected !== schema) {
    const variants = schema.oneOf ?? schema.anyOf ?? [];
    const discriminator = Object.entries(selected.properties ?? {}).find(([, child]) => child.const !== undefined)?.[0];
    return <FlexColumn gap={SPACING.sm} sx={FIELD_WIDTH}>
      {discriminator && variants.length > 1 && <InspectorFieldRow label={fieldLabel(discriminator)}><InspectorSelect grow label={fieldLabel(discriminator)} value={String(asRecord(value)[discriminator] ?? "")}
        options={variants.map((option) => ({ value: String(option.properties?.[discriminator]?.const ?? ""), label: String(option.properties?.[discriminator]?.const ?? "") }))}
        onChange={(next) => {
          const variant = variants.find((option) => option.properties?.[discriminator]?.const === next);
          if (variant) {
            const defaults = asRecord(schemaDefault(variant));
            onChange(path.includes("tracks.") && (next === "scaleX" || next === "scaleY")
              ? { ...defaults, from: 1, to: 1 } : defaults);
          }
        }} /></InspectorFieldRow>}
      <SchemaFields schema={selected} value={value} onChange={onChange} path={path} issuePath={issuePath} issues={issues} assets={assets} collisionLayers={collisionLayers} />
    </FlexColumn>;
  }
  if (schema.type === "object" || schema.properties) {
    const record = asRecord(value);
    // A const property is a union discriminator; the variant select above already edits it.
    // A 3D collider on a named layer derives its category and mask, so its raw bits are hidden.
    const derivedBits = path.endsWith("collider3d") && typeof record.layer === "string";
    const properties = Object.entries(schema.properties ?? {}).filter(([key, child]) => key !== "kind" && key !== "property" && child.const === undefined &&
      !(derivedBits && (key === "category" || key === "mask")));
    const pairs = [
      { label: fieldLabel(path || "value"), keys: ["x", "y", "z"], axes: ["X", "Y", "Z"] },
      { label: path.endsWith("transform2d") ? "Position" : "Axes", keys: ["x", "y"], axes: ["X", "Y"] },
      { label: "Scale", keys: ["scaleX", "scaleY"], axes: ["X", "Y"] },
      { label: "Size", keys: ["width", "height"], axes: ["W", "H"] }
    ].filter((pair) => pair.keys.every((key) => typeof record[key] === "number" &&
      ["number", "integer"].includes(schema.properties?.[key]?.type ?? "") && schema.required?.includes(key)));
    const absent = properties.filter(([key]) => record[key] === undefined && !(key === "layer" && path.endsWith("collider3d") && !collisionLayers?.length));
    return <FlexColumn gap={SPACING.xs} sx={FIELD_WIDTH}>
      {properties.filter(([key]) => record[key] !== undefined).map(([key, child]) => {
        const pair = pairs.find((entry) => entry.keys.includes(key));
        if (pair) {
          if (key !== pair.keys[0]) return null;
          return <InspectorFieldRow key={key} label={pair.label}>
            {pair.keys.map((axisKey, index) => <NumberField key={axisKey} label={fieldLabel(axisKey)} axis={pair.axes[index]}
              value={Number(record[axisKey])} schema={schema.properties?.[axisKey] ?? { type: "number" }} degrees={false}
              error={fieldError(issues, [...issuePath, axisKey])} onChange={(next) => onChange({ ...record, [axisKey]: next })} />)}
          </InspectorFieldRow>;
        }
        const childValue = record[key];
        const label = path ? `${path}.${key}` : key;
        const childPath = [...issuePath, key];
        const field = <SchemaFields schema={child} value={childValue} path={label} issuePath={childPath} issues={issues} assets={assets} collisionLayers={collisionLayers}
          onChange={(next) => onChange(withColliderLayer(path, record, key, next))} />;
        const optional = !schema.required?.includes(key);
        const remove = (): void => { const copy = { ...record }; delete copy[key]; onChange(copy); };
        if (isVectorSchema(child) && !optional) {
          return <FlexRow key={key} sx={{ ...FIELD_WIDTH, px: componentSections ? SPACING.md : undefined }}>{field}</FlexRow>;
        }
        if (child.type === "object" || child.properties || child.type === "array" || (child.oneOf ?? child.anyOf)?.some(isObjectSchema)) {
          return componentSections
            ? <Box key={key} sx={{ position: "relative", width: "100%" }}>
              <CollapsibleSection title={fieldLabel(key)} compact sx={COMPONENT_SECTION_SX}>
                <FlexColumn gap={SPACING.xs} sx={{ ...FIELD_WIDTH, px: SPACING.md, py: SPACING.sm }}>{field}</FlexColumn>
              </CollapsibleSection>
              {optional && <ToolbarIconButton icon={<CloseIcon fontSize="small" />} tooltip={`Remove ${fieldLabel(key)}`} onClick={remove}
                sx={{ position: "absolute", top: SPACING.micro, right: SPACING.xs }} />}
            </Box>
            : <CollapsibleSection key={key} title={<Label component="span" sx={{ mb: 0, color: "text.primary" }}>{fieldLabel(key)}</Label>} compact sx={{ width: "100%", pt: SPACING.xs }}><FlexColumn gap={SPACING.xs} sx={FIELD_WIDTH}>{field}{optional &&
              <EditorButton onClick={remove}>Remove {fieldLabel(key)}</EditorButton>}</FlexColumn></CollapsibleSection>;
        }
        return <FlexRow key={key} gap={SPACING.xs} align="flex-start" sx={{ ...FIELD_WIDTH, px: componentSections ? SPACING.md : undefined }}>
          <FlexColumn gap={SPACING.xs} sx={{ flex: 1, minWidth: 0 }}>{field}</FlexColumn>
          {optional && <ToolbarIconButton icon={<CloseIcon fontSize="small" />} tooltip={`Remove ${fieldLabel(key)}`} onClick={remove} />}
        </FlexRow>;
      })}
      {absent.length > 0 && <FlexRow gap={SPACING.xs} sx={componentSections ? ADD_COMPONENT_ROW_SX : ADD_FIELD_ROW_SX}>
        {absent.map(([key, child]) => <EditorButton key={key} variant="outlined" startIcon={<AddIcon fontSize="small" />}
          onClick={() => onChange(withColliderLayer(path, record, key, key === "layer" && path.endsWith("collider3d") ? collisionLayers?.[0] : schemaDefault(child)))}>Add {fieldLabel(key)}</EditorButton>)}
      </FlexRow>}
      {fieldError(issues, issuePath) && <Caption color="error">{fieldError(issues, issuePath)}</Caption>}
    </FlexColumn>;
  }
  if (schema.type === "array") {
    const items = Array.isArray(value) ? value : [];
    const fixedLength = Boolean(schema.prefixItems?.length);
    return <FlexColumn gap={SPACING.sm} sx={FIELD_WIDTH}>
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
  if ((path.endsWith("collider2d.category") || path.endsWith("collider2d.mask") || path.endsWith("collider3d.category") || path.endsWith("collider3d.mask")) && typeof value === "number") {
    return <FlexColumn gap={SPACING.xs} sx={FIELD_WIDTH}>
      <Label component="span" sx={{ mb: 0 }}>{path.endsWith("category") ? "Category" : "Mask"}</Label>
      <FlexRow gap={SPACING.xs} sx={{ flexWrap: "wrap" }}>
        {Array.from({ length: path.includes("collider3d") ? 16 : 32 }, (_, bit) => <Checkbox key={bit} compact size="small" label={collisionLayers?.[bit] ?? String(bit + 1)}
          checked={((value >>> bit) & 1) === 1} onChange={() => onChange(((value ^ (1 << bit)) >>> 0))}
          title={`Bit ${bit + 1}`} />)}
      </FlexRow>
      {error && <Caption color="error">{error}</Caption>}
    </FlexColumn>;
  }
  if (schema.enum) return <FlexColumn gap={SPACING.xs} sx={FIELD_WIDTH}><InspectorFieldRow label={fieldLabel(path)}><InspectorSelect grow label={fieldLabel(path)} value={String(value ?? "")}
    options={schema.enum.map((option) => ({ value: option, label: String(option) }))}
    onChange={(next) => onChange(schema.enum?.find((option) => String(option) === next) ?? next)} /></InspectorFieldRow>
    {error && <Caption color="error">{error}</Caption>}</FlexColumn>;
  if (schema.type === "boolean") return <FlexColumn gap={SPACING.xs} sx={FIELD_WIDTH}><InspectorToggleRow label={fieldLabel(path)} checked={Boolean(value)} onChange={onChange} />
    {error && <Caption color="error">{error}</Caption>}</FlexColumn>;
  if (schema.type === "number" || schema.type === "integer") {
    const degrees = path.endsWith("transform2d.rotation");
    return <NumberField label={degrees ? "Rotation" : fieldLabel(path)} value={typeof value === "number" ? value : 0} schema={schema}
      degrees={degrees} error={error} onChange={onChange} />;
  }
  if (schema.type === "string" && path.endsWith("collider3d.layer")) {
    const current = typeof value === "string" ? value : "";
    const names = collisionLayers?.includes(current) ? collisionLayers : [current, ...(collisionLayers ?? [])];
    return <FlexColumn gap={SPACING.xs} sx={FIELD_WIDTH}><InspectorFieldRow label="Layer"><InspectorSelect grow label="Layer" value={current}
      options={names.map((name) => ({ value: name, label: name }))} onChange={onChange} /></InspectorFieldRow>
      {error && <Caption color="error">{error}</Caption>}</FlexColumn>;
  }
  if (schema.type === "string") {
    const kind = assetKind(path);
    if (kind && assets) {
      const slots = Object.entries(assets).filter(([, binding]) => binding.mediaKind === kind).map(([slot]) => slot);
      const current = typeof value === "string" ? value : "";
      if (current && !slots.includes(current)) slots.unshift(current);
      return <FlexColumn gap={SPACING.xs} sx={FIELD_WIDTH}><InspectorFieldRow label={fieldLabel(path)}><InspectorSelect grow label={fieldLabel(path)} value={current} options={slots.map((slot) => ({ value: slot, label: slot }))}
        onChange={onChange} /></InspectorFieldRow>{error && <Caption color="error">{error}</Caption>}</FlexColumn>;
    }
    return <StringField label={fieldLabel(path)} value={typeof value === "string" ? value : ""} schema={schema} error={error} onChange={onChange} />;
  }
  return <Caption>{path}: unsupported field</Caption>;
}
