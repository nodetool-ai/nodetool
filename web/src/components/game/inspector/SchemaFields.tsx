import { useEffect, useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Euler, Quaternion } from "three";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import CloseIcon from "@mui/icons-material/Close";
import type { AnyGameDocument } from "@nodetool-ai/protocol";
import type { GameValidationIssue } from "@nodetool-ai/game-runtime";

import { Box, Caption, Checkbox, CONTROL, FieldDensityContext, FlexColumn, FlexRow, InspectorFieldRow, InspectorSection, InspectorSelect, InspectorValueInput, Label, SPACING, TextInput } from "../../ui_primitives";
import InspectorAddMenu from "./InspectorAddMenu";
import { AddButton, FieldGroup, RowAction } from "./InspectorParts";
import type { FieldSchema } from "./schemaForm";
import { schemaDefault, schemaVariant } from "./schemaForm";
import type { GameComponentEditorProps, GameComponentEditors } from "./componentEditors";

interface SchemaFieldsProps {
  schema: FieldSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  path?: string;
  issuePath?: readonly (string | number)[];
  issues?: readonly GameValidationIssue[];
  assets?: AnyGameDocument["assets"];
  collisionLayers?: readonly string[];
  /** Names of the document's 3D physics materials, offered by a collider's physicsMaterial field. */
  physicsMaterials?: readonly string[];
  /** Render this object's nested objects as full-width component sections, as in an engine inspector. */
  componentSections?: boolean;
  readonly componentEditors?: GameComponentEditors;
  readonly componentName?: string;
  readonly dimension?: GameComponentEditorProps["dimension"];
  /** Text of the menu button that adds an absent optional component section. */
  addLabel?: string;
  /** Content placed after this object's value rows and before its component sections. */
  beforeSections?: ReactNode;
  /** Controls placed at the end of a value row, such as a remove button. */
  trailing?: ReactNode;
  /** Leave out the add menu, because the group header that holds this object shows it. */
  hideAdd?: boolean;
}

const FIELD_WIDTH = { width: "100%", minWidth: 0 } as const;
const GROW = { flex: "1 1 auto", minWidth: 0 } as const;
const ADD_COMPONENT_ROW_SX = { width: "100%", pt: SPACING.sm, pb: SPACING.md, borderTop: 1, borderColor: "divider" } as const;
const AXES = ["X", "Y", "Z", "W"] as const;

function isObjectSchema(schema: FieldSchema): boolean {
  return schema.type === "object" || Boolean(schema.properties);
}

/** A required x/y or x/y/z number object renders as one row instead of a section. */
function isVectorSchema(schema: FieldSchema): boolean {
  const keys = Object.keys(schema.properties ?? {});
  return (keys.length === 2 || keys.length === 3) && ["x", "y", "z"].slice(0, keys.length).every((key) =>
    keys.includes(key) && ["number", "integer"].includes(schema.properties?.[key]?.type ?? "") && Boolean(schema.required?.includes(key)));
}

/** A fixed tuple of two to four numbers, such as a quaternion or an RGB domain, renders as one vector row. */
function tupleLength(schema: FieldSchema): number {
  const items = schema.prefixItems ?? [];
  return items.length >= 2 && items.length <= 4 && items.every((item) => ["number", "integer"].includes(item.type ?? "")) ? items.length : 0;
}

/** Objects, lists and object unions get their own collapsible group; everything else is one row. */
function isGroupSchema(schema: FieldSchema): boolean {
  if (isVectorSchema(schema) || tupleLength(schema) > 0) return false;
  return isObjectSchema(schema) || schema.type === "array" || Boolean((schema.oneOf ?? schema.anyOf)?.some(isObjectSchema));
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
  // Sentence case, as every inspector label: "castShadow" reads "Cast shadow".
  // A lone capital stays, so "scaleX" reads "Scale X".
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/ ([A-Z])(?=[a-z])/g, (_, letter: string) => ` ${letter.toLowerCase()}`)
    .replace(/([a-z])([23])d\b/i, "$1 $2D").replace(/^./, (letter) => letter.toUpperCase())
    .replace(/\bid\b/gi, "ID").replace(/\bhud\b/gi, "HUD");
}

function localizedFieldLabel(path: string, t: TFunction): string {
  const key = path.split(".").at(-1) ?? path;
  return t(`game.inspector.fields.${key}`, { defaultValue: fieldLabel(path) });
}

function trackCurve(easing: string): string {
  switch (easing) {
    case "easeIn": return "0,32 8,31 16,28 24,23 32,16";
    case "easeOut": return "0,32 8,24 16,19 24,17 32,16";
    case "easeInOut": return "0,32 8,30 16,24 24,18 32,16";
    default: return "0,32 32,16";
  }
}

/** A label and value row with the field's error under it. */
function FieldRow({ label, htmlFor, error, trailing, children }: { label: ReactNode; htmlFor?: string; error?: string; trailing?: ReactNode; children: ReactNode }) {
  return <FlexColumn gap={SPACING.micro} sx={FIELD_WIDTH}>
    <InspectorFieldRow label={label} htmlFor={htmlFor}>{children}{trailing}</InspectorFieldRow>
    {error && <Caption color="error">{error}</Caption>}
  </FlexColumn>;
}

function StringField({ label, value, schema, error, trailing, onChange }: { label: string; value: string; schema: FieldSchema; error?: string; trailing?: ReactNode; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const validLength = local.length >= (schema.minLength ?? 0);
  const validPattern = !schema.pattern || new RegExp(schema.pattern).test(local);
  const localError = !validLength ? t("game.inspector.errors.minCharacters", { count: schema.minLength }) : !validPattern ? t("game.inspector.errors.invalidFormat") : undefined;
  return <FieldRow label={label} error={localError ?? error} trailing={trailing}>
    <FieldDensityContext.Provider value="compact">
      <TextInput label={label} hideLabel compact type={schema.pattern === "^#[0-9a-fA-F]{6}$" || /^#[0-9a-fA-F]{6}$/.test(local) ? "color" : "text"}
        sx={GROW} value={local} onChange={(event) => {
          const next = event.target.value;
          setLocal(next);
          if (next.length >= (schema.minLength ?? 0) && (!schema.pattern || new RegExp(schema.pattern).test(next))) onChange(next);
        }} />
    </FieldDensityContext.Provider>
  </FieldRow>;
}

function numberAllowed(schema: FieldSchema, value: number): boolean {
  return Number.isFinite(value) && (schema.minimum === undefined || value >= schema.minimum) &&
    (schema.exclusiveMinimum === undefined || value > schema.exclusiveMinimum) &&
    (schema.maximum === undefined || value <= schema.maximum) && (schema.type !== "integer" || Number.isInteger(value));
}

function NumberField({ label, value, schema, degrees, error, axis, trailing, onChange }: { label: string; value: number; schema: FieldSchema; degrees: boolean; error?: string; axis?: string; trailing?: ReactNode; onChange: (value: number) => void }) {
  const { t } = useTranslation();
  const displayed = degrees ? Math.round(value * 180 / Math.PI * 100) / 100 : value;
  const [local, setLocal] = useState(String(displayed));
  useEffect(() => setLocal(String(displayed)), [displayed]);
  const numeric = Number(local);
  const actual = degrees ? numeric * Math.PI / 180 : numeric;
  const invalid = local.trim() === "" || !numberAllowed(schema, actual);
  const control = <InspectorValueInput ariaLabel={label} value={local} unit={degrees ? "°" : undefined} size="medium" grow minWidth={axis ? CONTROL.height.xl : undefined} onCommit={(raw) => {
    setLocal(raw);
    const next = Number(raw);
    const converted = degrees ? next * Math.PI / 180 : next;
    if (raw.trim() !== "" && numberAllowed(schema, converted)) onChange(converted);
  }} />;
  const message = invalid ? t("game.inspector.errors.outOfRange") : error;
  if (axis) {
    return <FlexColumn gap={SPACING.micro} sx={{ flex: 1, minWidth: 0 }}>{control}{message && <Caption color="error">{message}</Caption>}</FlexColumn>;
  }
  return <FieldRow label={label} error={message} trailing={trailing}>{control}</FieldRow>;
}

function BooleanField({ label, value, error, trailing, onChange }: { label: string; value: boolean; error?: string; trailing?: ReactNode; onChange: (value: boolean) => void }) {
  const id = useId();
  return <FieldRow label={label} htmlFor={id} error={error} trailing={trailing}>
    <Checkbox compact size="small" id={id} checked={value} onChange={(_event, checked) => onChange(checked)} sx={{ ml: -SPACING.micro }} />
    <Box sx={{ flex: 1 }} />
  </FieldRow>;
}

/** A unit quaternion edited as Euler angles in degrees, in the order the 3D transform uses. */
function QuaternionField({ label, value, trailing, onChange }: { label: string; value: readonly number[]; trailing?: ReactNode; onChange: (value: number[]) => void }) {
  const [x = 0, y = 0, z = 0, w = 1] = value;
  const angles = new Euler().setFromQuaternion(new Quaternion(x, y, z, w), "YXZ");
  const degrees = { x: angles.x * 180 / Math.PI, y: angles.y * 180 / Math.PI, z: angles.z * 180 / Math.PI };
  return <FieldRow label={label} trailing={trailing}>
    {(["x", "y", "z"] as const).map((axis) => <InspectorValueInput key={axis} ariaLabel={`${label} ${axis.toUpperCase()}`} grow minWidth={CONTROL.height.xl}
      value={String(Math.round(degrees[axis] * 100) / 100)} onCommit={(raw) => {
        const next = Number(raw);
        if (raw.trim() === "" || !Number.isFinite(next)) return;
        const updated = { ...degrees, [axis]: next };
        const quaternion = new Quaternion().setFromEuler(new Euler(updated.x * Math.PI / 180, updated.y * Math.PI / 180, updated.z * Math.PI / 180, "YXZ"));
        onChange([quaternion.x, quaternion.y, quaternion.z, quaternion.w]);
      }} />)}
  </FieldRow>;
}

/** Names a collider field may reference: the document's collision layers and physics materials. */
interface ColliderReferences {
  readonly collisionLayers?: readonly string[];
  readonly physicsMaterials?: readonly string[];
}

const MATERIAL_FIELDS = ["friction", "restitution", "frictionCombine", "restitutionCombine"];

/** Collider fields a named layer or physics material derives, so the inspector hides them. */
function derivedColliderField(path: string, record: Record<string, unknown>, key: string): boolean {
  if (!path.endsWith("collider3d")) return false;
  return typeof record.layer === "string" && (key === "category" || key === "mask") ||
    typeof record.physicsMaterial === "string" && MATERIAL_FIELDS.includes(key);
}

/** The optional fields an object lacks, and the object with one of them added at its default. */
function objectAdditions(schema: FieldSchema, value: unknown, path: string, references: ColliderReferences, t: TFunction): { options: { value: string; label: string }[]; add: (key: string) => Record<string, unknown> } {
  const record = asRecord(value);
  const collider = path.endsWith("collider3d");
  const options = Object.entries(schema.properties ?? {})
    .filter(([key, child]) => key !== "kind" && key !== "property" && child.const === undefined && record[key] === undefined &&
      !derivedColliderField(path, record, key) &&
      !(collider && key === "layer" && !references.collisionLayers?.length) &&
      !(collider && key === "physicsMaterial" && !references.physicsMaterials?.length))
    .map(([key]) => ({ value: key, label: localizedFieldLabel(key, t) }));
  const add = (key: string): Record<string, unknown> => {
    const child = schema.properties?.[key] ?? {};
    const initial = collider && key === "layer" ? references.collisionLayers?.[0] :
      collider && key === "physicsMaterial" ? references.physicsMaterials?.[0] : schemaDefault(child);
    return withColliderReference(path, record, key, initial);
  };
  return { options, add };
}

/** The add menu for a group header, when the group holds an object with absent optional fields. */
function headerAddMenu(title: string, schema: FieldSchema, value: unknown, path: string, references: ColliderReferences, onChange: (value: unknown) => void, t: TFunction): ReactNode {
  const selected = schemaVariant(schema, value);
  if (!isObjectSchema(selected)) return null;
  const additions = objectAdditions(selected, value, path, references, t);
  if (additions.options.length === 0) return null;
  return <InspectorAddMenu variant="icon" label={t("i18n-next101.game.inspector.addTo", { title })} options={additions.options} onSelect={(key) => onChange(additions.add(key))} />;
}

/** Sets one field of a record. Picking a 3D collider layer also resets raw category and
 * mask to their defaults in the same edit, since a layered collider derives them and
 * validation rejects non-default raw bits beside a layer. Picking a physics material
 * likewise resets inline friction and restitution and drops inline combine rules. */
function withColliderReference(path: string, record: Record<string, unknown>, key: string, next: unknown): Record<string, unknown> {
  if (path.endsWith("collider3d") && typeof next === "string") {
    if (key === "layer") return { ...record, layer: next, category: 1, mask: 0xffff };
    if (key === "physicsMaterial") {
      const { frictionCombine: _friction, restitutionCombine: _restitution, ...rest } = record;
      return { ...rest, physicsMaterial: next, friction: 0.5, restitution: 0 };
    }
  }
  return { ...record, [key]: next };
}

export default function SchemaFields({ schema, value, onChange, path = "", issuePath = [], issues = [], assets, collisionLayers, physicsMaterials, componentSections = false, componentEditors, componentName, dimension = "2d", addLabel, beforeSections, trailing, hideAdd = false }: SchemaFieldsProps) {
  const { t } = useTranslation();
  const shared = { issues, assets, collisionLayers, physicsMaterials, componentEditors, dimension };
  const Editor = componentName ? componentEditors?.[componentName] : undefined;
  if (Editor) {
    return <Editor schema={schema} value={value} onChange={onChange} path={path} issuePath={issuePath}
      issues={issues} dimension={dimension} {...(assets ? { assets } : {})} />;
  }
  const references: ColliderReferences = { collisionLayers, physicsMaterials };
  const selected = schemaVariant(schema, value);
  if (selected !== schema) {
    const variants = schema.oneOf ?? schema.anyOf ?? [];
    const discriminator = Object.entries(selected.properties ?? {}).find(([, child]) => child.const !== undefined)?.[0];
    return <FlexColumn gap={SPACING.xs} sx={FIELD_WIDTH}>
      {discriminator && variants.length > 1 && <FieldRow label={localizedFieldLabel(discriminator, t)}><InspectorSelect grow label={localizedFieldLabel(discriminator, t)} value={String(asRecord(value)[discriminator] ?? "")}
        options={variants.map((option) => ({ value: String(option.properties?.[discriminator]?.const ?? ""), label: String(option.properties?.[discriminator]?.const ?? "") }))}
        onChange={(next) => {
          const variant = variants.find((option) => option.properties?.[discriminator]?.const === next);
          if (variant) {
            const defaults = asRecord(schemaDefault(variant));
            onChange(path.includes("tracks.") && (next === "scaleX" || next === "scaleY")
              ? { ...defaults, from: 1, to: 1 } : defaults);
          }
        }} /></FieldRow>}
      <SchemaFields schema={selected} value={value} onChange={onChange} path={path} issuePath={issuePath} {...shared} trailing={trailing} hideAdd={hideAdd} />
    </FlexColumn>;
  }
  if (schema.type === "object" || schema.properties) {
    const record = asRecord(value);
    // A const property is a union discriminator; the variant select above already edits it.
    // A 3D collider on a named layer or physics material derives some fields, so they are hidden.
    const properties = Object.entries(schema.properties ?? {}).filter(([key, child]) => key !== "kind" && key !== "property" && child.const === undefined &&
      !derivedColliderField(path, record, key));
    const pairs = [
      { label: localizedFieldLabel(path || "value", t), keys: ["x", "y", "z"], axes: ["X", "Y", "Z"] },
      // A bare x/y object is named by its own key, such as "Pivot"; x and y beside other fields are a position.
      { label: isVectorSchema(schema) && path && !path.endsWith("transform2d") ? localizedFieldLabel(path, t) : t("game.inspector.fields.position"), keys: ["x", "y"], axes: ["X", "Y"] },
      { label: t("game.inspector.fields.scale"), keys: ["scaleX", "scaleY"], axes: ["X", "Y"] },
      { label: t("game.inspector.fields.size"), keys: ["width", "height"], axes: ["W", "H"] }
    ].filter((pair) => pair.keys.every((key) => typeof record[key] === "number" &&
      ["number", "integer"].includes(schema.properties?.[key]?.type ?? "") && schema.required?.includes(key)));
    const rows: ReactNode[] = [];
    const groups: ReactNode[] = [];
    let trailingPlaced = false;
    for (const [key, child] of properties) {
      if (record[key] === undefined) continue;
      const pair = pairs.find((entry) => entry.keys.includes(key));
      if (pair) {
        if (key !== pair.keys[0]) continue;
        // A bare vector object carries its owner's remove action on its single row.
        const rowTrailing: ReactNode = !trailingPlaced && isVectorSchema(schema) ? trailing : undefined;
        trailingPlaced = trailingPlaced || Boolean(rowTrailing);
        rows.push(<FieldRow key={key} label={pair.label} trailing={rowTrailing}>
          {pair.keys.map((axisKey, index) => <NumberField key={axisKey} label={localizedFieldLabel(axisKey, t)} axis={pair.axes[index]}
            value={Number(record[axisKey])} schema={schema.properties?.[axisKey] ?? { type: "number" }} degrees={false}
            error={fieldError(issues, [...issuePath, axisKey])} onChange={(next) => onChange({ ...record, [axisKey]: next })} />)}
        </FieldRow>);
        continue;
      }
      const label = path ? `${path}.${key}` : key;
      const optional = !schema.required?.includes(key);
      const remove = (): void => { const copy = { ...record }; delete copy[key]; onChange(copy); };
      const removeAction = optional ? <RowAction icon={<CloseIcon />} label={t("game.inspector.actions.removeField", { field: localizedFieldLabel(key, t) })} onClick={remove} /> : undefined;
      const group = isGroupSchema(child);
      const childChange = (next: unknown): void => onChange(withColliderReference(path, record, key, next));
      const nested = group && !componentSections;
      const editorProps = componentSections && group ? { componentName: key } : {};
      const field = <SchemaFields schema={child} value={record[key]} path={label} issuePath={[...issuePath, key]} {...shared} {...editorProps}
        trailing={group ? undefined : removeAction} hideAdd={nested} onChange={childChange} />;
      if (!group) {
        rows.push(<Box key={key} sx={FIELD_WIDTH}>{field}</Box>);
      } else if (componentSections) {
        groups.push(<InspectorSection key={key} title={localizedFieldLabel(key, t)}
          action={optional ? { icon: <CloseIcon />, label: t("game.inspector.actions.removeField", { field: localizedFieldLabel(key, t) }), onClick: remove } : undefined}>{field}</InspectorSection>);
      } else {
        groups.push(<FieldGroup key={key} title={localizedFieldLabel(key, t)} actions={<>
          {headerAddMenu(localizedFieldLabel(key, t), child, record[key], label, references, childChange, t)}
          {removeAction}
        </>}>{field}</FieldGroup>);
      }
    }
    const additions = objectAdditions(schema, record, path, references, t);
    const add = (key: string): void => onChange(additions.add(key));
    const addOptions = hideAdd ? [] : additions.options;
    return <FlexColumn gap={SPACING.xs} sx={FIELD_WIDTH}>
      {rows}
      {beforeSections}
      {groups}
      {addOptions.length > 0 && (componentSections
        ? <Box sx={ADD_COMPONENT_ROW_SX}><InspectorAddMenu label={addLabel ?? t("game.inspector.actions.addComponent")} options={addOptions} onSelect={add} /></Box>
        : <InspectorAddMenu label={t("game.inspector.actions.addProperty")} options={addOptions} onSelect={add} />)}
      {fieldError(issues, issuePath) && <Caption color="error">{fieldError(issues, issuePath)}</Caption>}
    </FlexColumn>;
  }
  const error = fieldError(issues, issuePath);
  if (schema.type === "array" && tupleLength(schema) > 0) {
    const items = Array.isArray(value) ? value.map(Number) : [];
    if (tupleLength(schema) === 4 && path.endsWith("rotation")) {
      return <QuaternionField label={localizedFieldLabel(path, t)} value={items} trailing={trailing} onChange={onChange} />;
    }
    const label = localizedFieldLabel(path, t);
    return <FieldRow label={label} error={error} trailing={trailing}>
      {items.map((item, index) => <NumberField key={index} label={`${label} ${AXES[index]}`} axis={AXES[index]} value={item}
        schema={schema.prefixItems?.[index] ?? { type: "number" }} degrees={false} error={fieldError(issues, [...issuePath, index])}
        onChange={(next) => onChange(items.map((entry, position) => position === index ? next : entry))} />)}
    </FieldRow>;
  }
  if (schema.type === "array") {
    const items = Array.isArray(value) ? value : [];
    const fixedLength = Boolean(schema.prefixItems?.length);
    return <FlexColumn gap={SPACING.xs} sx={FIELD_WIDTH}>
      {items.map((item, index) => {
        const itemSchema = schema.prefixItems?.[index] ?? schema.items ?? { type: "string" };
        const move = (to: number): void => { const copy = [...items]; [copy[to], copy[index]] = [copy[index], copy[to]]; onChange(copy); };
        const actions = fixedLength ? undefined : <>
          <RowAction icon={<ArrowUpwardIcon />} label={t("game.inspector.actions.moveUp")} disabled={index === 0} onClick={() => move(index - 1)} />
          <RowAction icon={<ArrowDownwardIcon />} label={t("game.inspector.actions.moveDown")} disabled={index === items.length - 1} onClick={() => move(index + 1)} />
          <RowAction icon={<CloseIcon />} label={t("game.inspector.actions.remove")} disabled={items.length <= (schema.minItems ?? 0)} onClick={() => onChange(items.filter((_, position) => position !== index))} />
        </>;
        const group = isGroupSchema(itemSchema);
        const kind = asRecord(item).kind;
        const itemChange = (next: unknown): void => onChange(items.map((entry, position) => position === index ? next : entry));
        const field = <SchemaFields schema={itemSchema} value={item} path={`${path}.${index}`} issuePath={[...issuePath, index]} {...shared}
          trailing={group ? undefined : actions} hideAdd={group} onChange={itemChange} />;
        const key = typeof asRecord(item).id === "string" ? String(asRecord(item).id) : index;
        if (!group) return <Box key={key} sx={FIELD_WIDTH}>{field}</Box>;
        const title = typeof kind === "string" ? `${index + 1}. ${localizedFieldLabel(kind, t)}` : t("game.inspector.fields.item", { count: index + 1 });
        return <FieldGroup key={key} title={title} actions={<>{headerAddMenu(title, itemSchema, item, `${path}.${index}`, references, itemChange, t)}{actions}</>}>
          {path.endsWith("tracks") && <svg role="img" aria-label={`${String(asRecord(item).easing ?? "linear")} curve`} width="64" height="40" viewBox="0 0 40 40">
            <polyline points={trackCurve(String(asRecord(item).easing ?? "linear"))} fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>}
          {field}
        </FieldGroup>;
      })}
      {!fixedLength && <AddButton disabled={items.length >= (schema.maxItems ?? Infinity)}
        onClick={() => onChange([...items, schemaDefault(schema.items ?? { type: "string" })])}>{t("game.inspector.actions.addItem")}</AddButton>}
      {error && <Caption color="error">{error}</Caption>}
    </FlexColumn>;
  }
  if ((path.endsWith("collider2d.category") || path.endsWith("collider2d.mask") || path.endsWith("collider3d.category") || path.endsWith("collider3d.mask")) && typeof value === "number") {
    return <FlexColumn gap={SPACING.xs} sx={FIELD_WIDTH}>
      <FlexRow align="center" sx={{ minHeight: CONTROL.height.xs }}>
        <Label component="span" sx={{ mb: 0, flex: 1 }}>{path.endsWith("category") ? t("game.inspector.fields.category") : t("game.inspector.fields.mask")}</Label>
        {trailing}
      </FlexRow>
      <Box sx={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${CONTROL.height.xl + CONTROL.height.xs}px, 1fr))`, columnGap: SPACING.xs }}>
        {Array.from({ length: path.includes("collider3d") ? 16 : 32 }, (_, bit) => <Checkbox key={bit} compact size="small" label={collisionLayers?.[bit] ?? String(bit + 1)}
          checked={((value >>> bit) & 1) === 1} onChange={() => onChange(((value ^ (1 << bit)) >>> 0))}
          title={t("game.inspector.accessibility.bit", { bit: bit + 1 })} />)}
      </Box>
      {error && <Caption color="error">{error}</Caption>}
    </FlexColumn>;
  }
  if (schema.enum) return <FieldRow label={localizedFieldLabel(path, t)} error={error} trailing={trailing}><InspectorSelect grow label={localizedFieldLabel(path, t)} value={String(value ?? "")}
    options={schema.enum.map((option) => ({ value: option, label: String(option) }))}
    onChange={(next) => onChange(schema.enum?.find((option) => String(option) === next) ?? next)} /></FieldRow>;
  if (schema.type === "boolean") return <BooleanField label={localizedFieldLabel(path, t)} value={Boolean(value)} error={error} trailing={trailing} onChange={onChange} />;
  if (schema.type === "number" || schema.type === "integer") {
    const degrees = path.endsWith("transform2d.rotation");
    return <NumberField label={degrees ? t("game.inspector.fields.rotation") : localizedFieldLabel(path, t)} value={typeof value === "number" ? value : 0} schema={schema}
      degrees={degrees} error={error} trailing={trailing} onChange={onChange} />;
  }
  const referenceField = path.endsWith("collider3d.layer") ? { label: t("game.inspector.fields.layer"), names: collisionLayers } :
    path.endsWith("collider3d.physicsMaterial") ? { label: t("game.inspector.fields.physicsMaterial"), names: physicsMaterials } : undefined;
  if (schema.type === "string" && referenceField) {
    const current = typeof value === "string" ? value : "";
    const names = referenceField.names?.includes(current) ? referenceField.names : [current, ...(referenceField.names ?? [])];
    return <FieldRow label={referenceField.label} error={error} trailing={trailing}><InspectorSelect grow label={referenceField.label} value={current}
      options={names.map((name) => ({ value: name, label: name }))} onChange={onChange} /></FieldRow>;
  }
  if (schema.type === "string") {
    const kind = assetKind(path);
    if (kind && assets) {
      const slots = Object.entries(assets).filter(([, binding]) => binding.mediaKind === kind).map(([slot]) => slot);
      const current = typeof value === "string" ? value : "";
      if (current && !slots.includes(current)) slots.unshift(current);
      return <FieldRow label={localizedFieldLabel(path, t)} error={error} trailing={trailing}><InspectorSelect grow label={localizedFieldLabel(path, t)} value={current} options={slots.map((slot) => ({ value: slot, label: slot }))}
        onChange={onChange} /></FieldRow>;
    }
    return <StringField label={localizedFieldLabel(path, t)} value={typeof value === "string" ? value : ""} schema={schema} error={error} trailing={trailing} onChange={onChange} />;
  }
  return <Caption>{path}: unsupported field</Caption>;
}
