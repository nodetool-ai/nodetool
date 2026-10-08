/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useRef, useState, type ReactNode } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import * as THREE from "three";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import TouchAppOutlinedIcon from "@mui/icons-material/TouchAppOutlined";

import {
  Box,
  Caption,
  Checkbox,
  CollapsibleSection,
  EmptyState,
  FlexColumn,
  FlexRow,
  NodeSlider,
  NumericField,
  PropertyFieldRow,
  ScrollArea,
  SelectField,
  Text,
  TextInput,
  ToolbarIconButton,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import ColorPicker from "../inputs/ColorPicker";
import {
  GEOMETRY_PARAM_SPECS,
  buildGeometry,
  isEditableGeometryType,
  readGeometryParams,
  type GeometryParams
} from "./geometryParams";
import type { RecordEdit } from "./editorCommands";
import { isBoolean, isNumber } from "../../utils/typePredicates";

const styles = (theme: Theme) =>
  css({
    "&": { width: "100%", height: "100%", minHeight: 0 },
    ".inspector-header": {
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.md)}`,
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      flexShrink: 0
    },
    ".inspector-section": {
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      paddingBottom: getSpacingPx(SPACING.sm)
    },
    ".inspector-section > div:first-of-type": {
      padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.md)}`
    },
    ".select-field": {
      flex: 1,
      ".MuiSelect-select": {
        padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.sm)}`,
        fontSize: theme.fontSizeSmall
      },
      ".MuiSvgIcon-root": { fontSize: "var(--fontSizeNormal)" }
    }
  });

const SectionTitle = ({ children }: { children: ReactNode }) => (
  <Text
    size="smaller"
    weight={600}
    sx={{ textTransform: "uppercase", letterSpacing: "0.06em", color: "text.secondary" }}
  >
    {children}
  </Text>
);

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <CollapsibleSection
    className="inspector-section"
    title={<SectionTitle>{title}</SectionTitle>}
    defaultOpen
    compact
  >
    <FlexColumn fullWidth gap={SPACING.micro}>
      {children}
    </FlexColumn>
  </CollapsibleSection>
);

// Wide enough for "Frustum Cull" and "Render Order" on one line in the
// 300px inspector.
const LABEL_WIDTH = "36%";

interface NumberRowProps {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  integer?: boolean;
}

// Bounded params (both min and max defined) render as a slider with a compact
// numeric readout; unbounded ones (dimensions, segments, intensity) stay as a
// plain number field.
const NumberRow = memo(({ label, value, onCommit, step, min, max, integer }: NumberRowProps) => {
  const isSlider = min !== undefined && max !== undefined;
  return (
    <PropertyFieldRow labelWidth={LABEL_WIDTH} label={label}>
      <FlexRow align="center" gap={SPACING.md} fullWidth sx={{ minWidth: 0 }}>
        {isSlider && (
          <NodeSlider
            aria-label={label}
            value={value}
            min={min}
            max={max}
            step={integer ? 1 : step ?? 0.01}
            onChange={(_e, v) => onCommit(Array.isArray(v) ? v[0] : v)}
            sx={{ flex: 1, minWidth: 0 }}
          />
        )}
        <FlexRow sx={{ flex: isSlider ? "0 0 30%" : 1, minWidth: 0 }}>
          <NumericField
            label={label}
            value={value}
            onCommit={onCommit}
            step={step}
            min={min}
            max={max}
            integer={integer}
          />
        </FlexRow>
      </FlexRow>
    </PropertyFieldRow>
  );
});
NumberRow.displayName = "NumberRow";

interface CheckboxRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const CheckboxRow = ({ label, checked, onChange }: CheckboxRowProps) => (
  <PropertyFieldRow labelWidth={LABEL_WIDTH} label={label}>
    <Checkbox size="small" compact inputProps={{ "aria-label": label }} checked={checked} onChange={(_e, c) => onChange(c)} />
  </PropertyFieldRow>
);

/**
 * `ColorPicker` appends an alpha byte (`#rrggbbaa`) for translucent picks.
 * `THREE.Color` has no alpha and rejects that form, so keep the RGB part.
 */
export const toOpaqueHex = (value: string): string =>
  /^#[0-9a-f]{8}$/i.test(value) ? value.slice(0, 7) : value;

interface ColorRowProps {
  label: string;
  color: THREE.Color;
  record: RecordEdit;
  mergeKey: string;
}

const ColorRow = ({ label, color, record, mergeKey }: ColorRowProps) => (
  <PropertyFieldRow labelWidth={LABEL_WIDTH} label={label} spacious>
    <ColorPicker
      showCustom
      color={`#${color.getHexString()}`}
      onColorChange={(c) => {
        if (!c) {
          return;
        }
        const next = new THREE.Color(toOpaqueHex(c)).getHex();
        record({
          label: `Change ${label.toLowerCase()}`,
          mergeKey,
          get: () => color.getHex(),
          set: (hex) => color.setHex(hex),
          value: next
        });
      }}
    />
  </PropertyFieldRow>
);

type Axis = "x" | "y" | "z";
const AXES: readonly Axis[] = ["x", "y", "z"];
const AXIS_COLORS: Record<Axis, string> = {
  x: "error.main",
  y: "success.main",
  z: "info.main"
};

interface AxisFieldProps {
  axis: Axis;
  label: string;
  value: number;
  step: number;
  onCommit: (value: number) => void;
}

/**
 * One vector component. Dragging the axis letter scrubs the value, as in
 * Blender and Unity: Shift for fine steps, Ctrl for coarse ones.
 */
const AxisField = ({ axis, label, value, step, onCommit }: AxisFieldProps) => {
  const drag = useRef<{ x: number; value: number } | null>(null);
  return (
    <FlexRow align="center" sx={{ flex: 1, minWidth: 0 }}>
      <Box
        component="span"
        role="slider"
        tabIndex={-1}
        aria-label={`Drag to change ${label}`}
        aria-valuenow={value}
        onPointerDown={(e: React.PointerEvent<HTMLSpanElement>) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, value };
        }}
        onPointerMove={(e: React.PointerEvent<HTMLSpanElement>) => {
          if (!drag.current) {
            return;
          }
          const scale = e.shiftKey ? 0.1 : e.ctrlKey || e.metaKey ? 10 : 1;
          const next = drag.current.value + (e.clientX - drag.current.x) * step * scale * 0.25;
          onCommit(Math.round(next * 1000) / 1000);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        sx={{
          flexShrink: 0,
          px: SPACING.xs,
          alignSelf: "stretch",
          display: "grid",
          placeItems: "center",
          cursor: "ew-resize",
          userSelect: "none",
          fontSize: "var(--fontSizeSmaller)",
          fontWeight: 600,
          color: AXIS_COLORS[axis],
          borderRadius: BORDER_RADIUS.xs,
          "&:hover": { bgcolor: "action.hover" }
        }}
      >
        {axis.toUpperCase()}
      </Box>
      <NumericField label={label} value={value} onCommit={onCommit} step={step} />
    </FlexRow>
  );
};

interface Vector3RowProps {
  label: string;
  objectUuid: string;
  vector: THREE.Vector3 | THREE.Euler;
  toDisplay?: (v: number) => number;
  fromDisplay?: (v: number) => number;
  step: number;
  resetValue: number;
  record: RecordEdit;
}

const identity = (v: number) => v;

const Vector3Row = ({
  label,
  objectUuid,
  vector,
  toDisplay = identity,
  fromDisplay = identity,
  step,
  resetValue,
  record
}: Vector3RowProps) => {
  const commit = (axis: Axis) => (display: number) =>
    record({
      label: `Change ${label.toLowerCase()}`,
      mergeKey: `${objectUuid}:${label}:${axis}`,
      get: () => vector[axis],
      set: (v) => {
        vector[axis] = v;
      },
      value: fromDisplay(display)
    });
  const isDefault = AXES.every((a) => Math.abs(vector[a] - resetValue) < 1e-9);
  return (
    <FlexColumn fullWidth sx={{ px: SPACING.md, minWidth: 0 }}>
      <FlexRow align="center" justify="space-between" sx={{ minHeight: 24 }}>
        <Caption>{label}</Caption>
        <ToolbarIconButton
          icon={<RestartAltIcon sx={{ fontSize: "var(--fontSizeNormal)" }} />}
          tooltip={`Reset ${label.toLowerCase()}`}
          size="small"
          disabled={isDefault}
          onClick={() =>
            record({
              label: `Reset ${label.toLowerCase()}`,
              get: () => [vector.x, vector.y, vector.z] as const,
              set: ([x, y, z]) => {
                vector.x = x;
                vector.y = y;
                vector.z = z;
              },
              value: [resetValue, resetValue, resetValue] as const,
              equals: (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
            })
          }
        />
      </FlexRow>
      <FlexRow gap={SPACING.xs} sx={{ minWidth: 0 }}>
        {AXES.map((axis) => (
          <AxisField
            key={axis}
            axis={axis}
            label={`${label} ${axis.toUpperCase()}`}
            value={Math.round(toDisplay(vector[axis]) * 1000) / 1000}
            step={step}
            onCommit={commit(axis)}
          />
        ))}
      </FlexRow>
    </FlexColumn>
  );
};

// --- Typed-but-dynamic property access -------------------------------------
// Material fields differ by material type (Standard vs Physical vs loaded GLTF
// materials). These helpers read a property only when it is present with the
// expected runtime type, so the panel adapts to whatever material the
// selected mesh carries without `any`.
type PropertyBag = Record<string, unknown>;

const getNumberProp = (obj: PropertyBag, key: string): number | undefined => {
  const v = obj[key];
  return isNumber(v) ? v : undefined;
};

const getColorProp = (obj: PropertyBag, key: string): THREE.Color | undefined => {
  const v = obj[key];
  return v instanceof THREE.Color ? v : undefined;
};

const getBoolProp = (obj: PropertyBag, key: string): boolean | undefined => {
  const v = obj[key];
  return isBoolean(v) ? v : undefined;
};

const setProp = (obj: PropertyBag, key: string, value: unknown): void => {
  obj[key] = value;
};

/**
 * Materials and lights expose their fields as plain properties. The panel
 * reads them by name through the guarded helpers above, so this is the one
 * place they are viewed as a property bag.
 */
const bagOf = (value: THREE.Material | THREE.Object3D): PropertyBag =>
  value as unknown as PropertyBag;

interface MaterialNumberSpec {
  key: string;
  label: string;
  min?: number;
  max?: number;
  step: number;
}

// Ordered so common PBR controls come first; physical-only fields are skipped
// automatically when absent on the material.
const MATERIAL_NUMBER_FIELDS: readonly MaterialNumberSpec[] = [
  { key: "metalness", label: "Metalness", min: 0, max: 1, step: 0.05 },
  { key: "roughness", label: "Roughness", min: 0, max: 1, step: 0.05 },
  { key: "emissiveIntensity", label: "Emission", min: 0, step: 0.05 },
  { key: "ior", label: "IOR", min: 1, max: 2.333, step: 0.01 },
  { key: "reflectivity", label: "Reflectivity", min: 0, max: 1, step: 0.05 },
  { key: "specularIntensity", label: "Specular", min: 0, max: 1, step: 0.05 },
  { key: "clearcoat", label: "Clearcoat", min: 0, max: 1, step: 0.05 },
  { key: "clearcoatRoughness", label: "CC Rough", min: 0, max: 1, step: 0.05 },
  { key: "sheen", label: "Sheen", min: 0, max: 1, step: 0.05 },
  { key: "sheenRoughness", label: "Sheen Rough", min: 0, max: 1, step: 0.05 },
  { key: "transmission", label: "Transmission", min: 0, max: 1, step: 0.05 },
  { key: "thickness", label: "Thickness", min: 0, step: 0.1 },
  { key: "iridescence", label: "Iridescence", min: 0, max: 1, step: 0.05 },
  { key: "iridescenceIOR", label: "Irid IOR", min: 1, max: 2.333, step: 0.01 },
  { key: "dispersion", label: "Dispersion", min: 0, step: 0.1 }
];

const MATERIAL_COLOR_FIELDS: readonly { key: string; label: string }[] = [
  { key: "color", label: "Base Color" },
  { key: "emissive", label: "Emissive" },
  { key: "sheenColor", label: "Sheen Color" },
  { key: "specularColor", label: "Specular" },
  { key: "attenuationColor", label: "Atten Col" }
];

// `recompile` fields change the shader program and require needsUpdate = true.
const MATERIAL_FLAG_FIELDS: readonly {
  key: string;
  label: string;
  recompile: boolean;
}[] = [
  { key: "transparent", label: "Transparent", recompile: true },
  { key: "wireframe", label: "Wireframe", recompile: false },
  { key: "flatShading", label: "Flat Shading", recompile: true },
  { key: "vertexColors", label: "Vertex Colors", recompile: true },
  { key: "depthTest", label: "Depth Test", recompile: false },
  { key: "depthWrite", label: "Depth Write", recompile: false }
];

const SIDE_OPTIONS = [
  { value: String(THREE.FrontSide), label: "Front" },
  { value: String(THREE.BackSide), label: "Back" },
  { value: String(THREE.DoubleSide), label: "Double" }
] as const;

/**
 * Materials the opacity control made transparent. Setting opacity back to 1
 * turns transparency off again for these, and only these, so a material that
 * was transparent on load (alpha textures) keeps its blend mode.
 */
const autoTransparent = new WeakSet<THREE.Material>();

export const applyOpacity = (material: THREE.Material, opacity: number): void => {
  material.opacity = opacity;
  if (opacity < 1 && !material.transparent) {
    material.transparent = true;
    autoTransparent.add(material);
  } else if (opacity >= 1 && autoTransparent.has(material)) {
    material.transparent = false;
    autoTransparent.delete(material);
  }
  material.needsUpdate = true;
};

const toDegrees = THREE.MathUtils.radToDeg;
const toRadians = THREE.MathUtils.degToRad;

interface MaterialSectionProps {
  material: THREE.Material;
  record: RecordEdit;
}

const MaterialSection = ({ material, record }: MaterialSectionProps) => {
  const key = (field: string) => `${material.uuid}:${field}`;
  const setNumber = (field: string, label: string, value: number) =>
    record({
      label: `Change ${label.toLowerCase()}`,
      mergeKey: key(field),
      get: () => getNumberProp(bagOf(material), field) ?? 0,
      set: (v) => {
        setProp(bagOf(material), field, v);
      },
      value
    });
  return (
    <>
      <Caption sx={{ px: SPACING.md, pb: SPACING.xs }}>
        {material.name ? `${material.name} · ${material.type}` : material.type}
      </Caption>
      {MATERIAL_COLOR_FIELDS.map(({ key: field, label }) => {
        const color = getColorProp(bagOf(material), field);
        return color ? (
          <ColorRow key={field} label={label} color={color} record={record} mergeKey={key(field)} />
        ) : null;
      })}
      {MATERIAL_NUMBER_FIELDS.map((spec) => {
        const current = getNumberProp(bagOf(material), spec.key);
        return current === undefined ? null : (
          <NumberRow
            key={spec.key}
            label={spec.label}
            value={current}
            min={spec.min}
            max={spec.max}
            step={spec.step}
            onCommit={(v) => {
              let next = v;
              if (spec.min !== undefined) {
                next = Math.max(spec.min, next);
              }
              if (spec.max !== undefined) {
                next = Math.min(spec.max, next);
              }
              setNumber(spec.key, spec.label, next);
            }}
          />
        );
      })}
      <NumberRow
        label="Opacity"
        value={material.opacity}
        min={0}
        max={1}
        step={0.05}
        onCommit={(v) =>
          record({
            label: "Change opacity",
            mergeKey: key("opacity"),
            get: () => material.opacity,
            set: (o) => applyOpacity(material, o),
            value: THREE.MathUtils.clamp(v, 0, 1)
          })
        }
      />
      <NumberRow
        label="Alpha Test"
        value={material.alphaTest}
        min={0}
        max={1}
        step={0.05}
        onCommit={(v) =>
          record({
            label: "Change alpha test",
            mergeKey: key("alphaTest"),
            get: () => material.alphaTest,
            set: (a) => {
              material.alphaTest = a;
              material.needsUpdate = true;
            },
            value: THREE.MathUtils.clamp(v, 0, 1)
          })
        }
      />
      <PropertyFieldRow labelWidth={LABEL_WIDTH} label="Side">
        <SelectField
          className="select-field nodrag"
          hideLabel
          label="Side"
          size="small"
          value={String(material.side)}
          options={SIDE_OPTIONS}
          onChange={(v) =>
            record({
              label: "Change side",
              get: () => material.side,
              set: (side) => {
                material.side = side;
                material.needsUpdate = true;
              },
              value: Number(v) as THREE.Side
            })
          }
        />
      </PropertyFieldRow>
      {MATERIAL_FLAG_FIELDS.map(({ key: field, label, recompile }) => {
        const checked = getBoolProp(bagOf(material), field);
        return checked === undefined ? null : (
          <CheckboxRow
            key={field}
            label={label}
            checked={checked}
            onChange={(c) =>
              record({
                label: `Toggle ${label.toLowerCase()}`,
                get: () => getBoolProp(bagOf(material), field) ?? false,
                set: (value) => {
                  setProp(bagOf(material), field, value);
                  if (recompile) {
                    material.needsUpdate = true;
                  }
                },
                value: c
              })
            }
          />
        );
      })}
    </>
  );
};

interface PropertiesPanelProps {
  object: THREE.Object3D | null;
  /** Bump to force re-read of mutated object values (e.g. after gizmo drag). */
  tick: number;
  record: RecordEdit;
}

const PropertiesPanel = ({ object, tick, record }: PropertiesPanelProps) => {
  const theme = useTheme();
  const [materialSlot, setMaterialSlot] = useState(0);
  // `tick` is intentionally a render trigger: bumping it re-renders this panel
  // so NumericField inputs resync from objects mutated by gizmo drags.
  void tick;

  if (!object) {
    return (
      <FlexColumn css={styles(theme)} className="properties-panel" fullHeight>
        <EmptyState
          variant="empty"
          size="small"
          icon={<TouchAppOutlinedIcon />}
          title="Nothing selected"
          description="Click an object in the viewport or the scene list to inspect it."
        />
      </FlexColumn>
    );
  }

  const uuid = object.uuid;
  const mesh = object instanceof THREE.Mesh ? object : null;
  const materials: THREE.Material[] = mesh
    ? Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material]
    : [];
  const slot = Math.min(materialSlot, Math.max(0, materials.length - 1));
  const material = materials[slot] ?? null;
  const light = object instanceof THREE.Light ? object : null;
  const pointLight = object instanceof THREE.PointLight ? object : null;
  const spotLight = object instanceof THREE.SpotLight ? object : null;

  const geometryType = mesh?.geometry.type;
  const geometryParams = mesh ? readGeometryParams(mesh.geometry) : null;
  const hasGeometry =
    !!mesh && !!geometryParams && isEditableGeometryType(geometryType);

  const rebuildGeometry = (key: string, isAngle: boolean) => (display: number) => {
    if (!mesh || !isEditableGeometryType(geometryType)) {
      return;
    }
    const raw = isAngle ? toRadians(display) : display;
    const next: GeometryParams = { ...readGeometryParams(mesh.geometry), [key]: raw };
    record({
      label: "Edit geometry",
      mergeKey: `${uuid}:geometry:${key}`,
      get: () => mesh.geometry,
      set: (geometry) => {
        mesh.geometry = geometry;
      },
      value: buildGeometry(geometryType, next),
      release: (geometry) => geometry.dispose()
    });
  };

  const setNumber = (
    label: string,
    field: string,
    target: THREE.Object3D,
    value: number
  ) =>
    record({
      label: `Change ${label.toLowerCase()}`,
      mergeKey: `${uuid}:${field}`,
      get: () => getNumberProp(bagOf(target), field) ?? 0,
      set: (v) => {
        setProp(bagOf(target), field, v);
      },
      value
    });

  const setFlag = (label: string, field: string, target: THREE.Object3D, value: boolean) =>
    record({
      label: `Toggle ${label.toLowerCase()}`,
      get: () => getBoolProp(bagOf(target), field) ?? false,
      set: (v) => {
        setProp(bagOf(target), field, v);
      },
      value
    });

  return (
    <FlexColumn css={styles(theme)} className="properties-panel" fullHeight>
      <FlexColumn className="inspector-header" gap={SPACING.xs} key={`header-${uuid}`}>
        <TextInput
          className="nodrag"
          label="Name"
          hideLabel
          size="small"
          value={object.name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            record({
              label: "Rename",
              mergeKey: `${uuid}:name`,
              get: () => object.name,
              set: (name) => {
                object.name = name;
              },
              value: e.target.value
            })
          }
        />
        <Caption>{object.type}</Caption>
      </FlexColumn>
      <ScrollArea>
        {/* Remount fields only when the selected object changes; live value
            updates from gizmo drags are handled by NumericField's value sync. */}
        <FlexColumn key={uuid} fullWidth>
          <Section title="Transform">
            <Vector3Row label="Position" objectUuid={uuid} vector={object.position} step={0.1} resetValue={0} record={record} />
            <Vector3Row
              label="Rotation"
              objectUuid={uuid}
              vector={object.rotation}
              toDisplay={toDegrees}
              fromDisplay={toRadians}
              step={1}
              resetValue={0}
              record={record}
            />
            <Vector3Row label="Scale" objectUuid={uuid} vector={object.scale} step={0.1} resetValue={1} record={record} />
          </Section>

          {light && (
            <Section title="Light">
              <ColorRow label="Color" color={light.color} record={record} mergeKey={`${uuid}:lightColor`} />
              <NumberRow
                label="Intensity"
                value={light.intensity}
                min={0}
                step={0.1}
                onCommit={(v) => setNumber("Intensity", "intensity", light, Math.max(0, v))}
              />
              {(pointLight ?? spotLight) && (
                <>
                  <NumberRow
                    label="Range"
                    value={(pointLight ?? spotLight)?.distance ?? 0}
                    min={0}
                    step={0.5}
                    onCommit={(v) => setNumber("Range", "distance", light, Math.max(0, v))}
                  />
                  <NumberRow
                    label="Decay"
                    value={(pointLight ?? spotLight)?.decay ?? 2}
                    min={0}
                    step={0.1}
                    onCommit={(v) => setNumber("Decay", "decay", light, Math.max(0, v))}
                  />
                </>
              )}
              {spotLight && (
                <>
                  <NumberRow
                    label="Angle"
                    value={toDegrees(spotLight.angle)}
                    min={1}
                    max={90}
                    step={1}
                    onCommit={(v) => setNumber("Angle", "angle", spotLight, toRadians(THREE.MathUtils.clamp(v, 1, 90)))}
                  />
                  <NumberRow
                    label="Penumbra"
                    value={spotLight.penumbra}
                    min={0}
                    max={1}
                    step={0.05}
                    onCommit={(v) => setNumber("Penumbra", "penumbra", spotLight, THREE.MathUtils.clamp(v, 0, 1))}
                  />
                </>
              )}
            </Section>
          )}

          {hasGeometry && mesh && geometryParams && isEditableGeometryType(geometryType) && (
            <Section title="Geometry">
              <Caption sx={{ px: SPACING.md, pb: SPACING.xs }}>{geometryType}</Caption>
              {GEOMETRY_PARAM_SPECS[geometryType].map((spec) => {
                const isAngle = spec.kind === "angle";
                const stored = geometryParams[spec.key];
                const value = isNumber(stored) ? stored : 0;
                const display = isAngle ? toDegrees(value) : value;
                return (
                  <NumberRow
                    key={spec.key}
                    label={spec.label}
                    value={display}
                    integer={spec.kind === "int"}
                    min={isAngle ? 0 : spec.min}
                    max={isAngle ? 360 : undefined}
                    step={isAngle ? 1 : spec.step}
                    onCommit={rebuildGeometry(spec.key, isAngle)}
                  />
                );
              })}
            </Section>
          )}

          {material && (
            <Section title="Material">
              {materials.length > 1 && (
                <PropertyFieldRow labelWidth={LABEL_WIDTH} label="Slot">
                  <SelectField
                    className="select-field nodrag"
                    hideLabel
                    label="Material slot"
                    size="small"
                    value={String(slot)}
                    options={materials.map((m, i) => ({
                      value: String(i),
                      label: `${i}: ${m.name || m.type}`
                    }))}
                    onChange={(v) => setMaterialSlot(Number(v))}
                  />
                </PropertyFieldRow>
              )}
              <MaterialSection key={material.uuid} material={material} record={record} />
            </Section>
          )}

          <Section title="Rendering">
            <CheckboxRow label="Visible" checked={object.visible} onChange={(c) => setFlag("Visible", "visible", object, c)} />
            {mesh && (
              <>
                <CheckboxRow label="Cast Shadow" checked={mesh.castShadow} onChange={(c) => setFlag("Cast shadow", "castShadow", mesh, c)} />
                <CheckboxRow label="Receive Shadow" checked={mesh.receiveShadow} onChange={(c) => setFlag("Receive shadow", "receiveShadow", mesh, c)} />
              </>
            )}
            <CheckboxRow label="Frustum Cull" checked={object.frustumCulled} onChange={(c) => setFlag("Frustum cull", "frustumCulled", object, c)} />
            <NumberRow
              label="Render Order"
              value={object.renderOrder}
              integer
              step={1}
              onCommit={(v) => setNumber("Render order", "renderOrder", object, v)}
            />
          </Section>
        </FlexColumn>
      </ScrollArea>
    </FlexColumn>
  );
};

export default memo(PropertiesPanel);
