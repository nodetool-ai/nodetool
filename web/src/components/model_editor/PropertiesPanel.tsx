/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import * as THREE from "three";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import TouchAppOutlinedIcon from "@mui/icons-material/TouchAppOutlined";

import {
  Box,
  Caption,
  EmptyState,
  FlexColumn,
  FlexRow,
  InspectorFieldRow,
  InspectorSection,
  InspectorSelect,
  InspectorToggleRow,
  InspectorValueInput,
  Label,
  NodeSlider,
  ScrollArea,
  TextInput,
  ToolbarIconButton,
  CONTROL,
  SPACING,
  TYPOGRAPHY,
  getSpacingPx,
  type InspectorValueGesture,
  ICON_SIZE
} from "../ui_primitives";
import ColorPicker from "../inputs/ColorPicker";
import {
  GEOMETRY_PARAM_SPECS,
  buildGeometry,
  isEditableGeometryType,
  readGeometryParams,
  type GeometryParams
} from "./geometryParams";
import type { RecordEdit, ValueEdit } from "./editorCommands";
import { isBoolean, isNumber } from "../../utils/typePredicates";

const headerStyles = (theme: Theme) =>
  css({
    padding: getSpacingPx(SPACING.lg),
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    flexShrink: 0
  });

interface NumberRowProps {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  integer?: boolean;
}

const formatNumber = (value: number): string => String(Math.round(value * 1000) / 1000);

/**
 * Commits a typed or scrubbed value. A scrub commits on every frame so the
 * viewport follows the drag; `record` merges the frames into one undo entry.
 */
const useNumberCommit = (onCommit: (value: number) => void, integer?: boolean) => {
  const commit = (raw: string | undefined) => {
    const parsed = Number(raw);
    if (raw !== undefined && raw.trim() !== "" && Number.isFinite(parsed)) {
      onCommit(integer ? Math.round(parsed) : parsed);
    }
  };
  const gesture: InspectorValueGesture = { begin: () => undefined, schedule: commit, commit };
  return { commit, gesture };
};

// Bounded params (both min and max defined) add a slider before the value;
// unbounded ones (dimensions, segments, intensity) are a value field alone.
const NumberRow = memo(({ label, value, onCommit, step = 0.01, min, max, integer }: NumberRowProps) => {
  const isSlider = min !== undefined && max !== undefined;
  const { commit, gesture } = useNumberCommit(onCommit, integer);
  return (
    <InspectorFieldRow label={label}>
      {isSlider && (
        <NodeSlider
          aria-label={label}
          value={value}
          min={min}
          max={max}
          step={integer ? 1 : step}
          onChange={(_e, v) => onCommit(Array.isArray(v) ? v[0] : v)}
          sx={{ flex: 1, minWidth: 0 }}
        />
      )}
      <InspectorValueInput
        ariaLabel={label}
        value={formatNumber(value)}
        onCommit={commit}
        scrub={{ step: integer ? 1 : step, min, max }}
        scrubGesture={gesture}
        grow={!isSlider}
        minWidth={CONTROL.height.xl + CONTROL.height.xs}
      />
    </InspectorFieldRow>
  );
});
NumberRow.displayName = "NumberRow";

interface ToggleRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const ToggleRow = ({ label, checked, onChange }: ToggleRowProps) => (
  <InspectorToggleRow label={label} checked={checked} onChange={onChange} />
);

/**
 * `ColorPicker` appends an alpha byte (`#rrggbbaa`) for translucent picks.
 * `THREE.Color` has no alpha and rejects that form, so keep the RGB part.
 */
export const toOpaqueHex = (value: string): string =>
  /^#[0-9a-f]{8}$/i.test(value) ? value.slice(0, 7) : value;

/**
 * The edit for a color picked in the Inspector. It snapshots the exact
 * color, not its 8-bit hex, so undo restores the file's value instead of a
 * rounded one that the next save would write.
 */
export const colorEdit = (
  label: string,
  color: THREE.Color,
  picked: string,
  mergeKey: string,
  editLabel = label
): ValueEdit<THREE.Color> => ({
  label: editLabel,
  mergeKey,
  get: () => color.clone(),
  set: (value) => {
    color.copy(value);
  },
  value: new THREE.Color(toOpaqueHex(picked)),
  equals: (a, b) => a.getHex() === b.getHex()
});

interface ColorRowProps {
  label: string;
  color: THREE.Color;
  record: RecordEdit;
  mergeKey: string;
}

const ColorRow = ({ label, color, record, mergeKey }: ColorRowProps) => {
  const { t } = useTranslation();
  return (
    <InspectorFieldRow label={label}>
      <ColorPicker
        showCustom
        color={`#${color.getHexString()}`}
        onColorChange={(c) => {
          if (!c) {
            return;
          }
          record(colorEdit(label, color, c, mergeKey, t("i18n-cont-model-editor-11.properties.change", { label: label.toLowerCase() })));
        }}
      />
    </InspectorFieldRow>
  );
};

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
 * One vector component. Dragging the field scrubs the value, as in Blender
 * and Unity: Shift for coarse steps, Alt for fine ones.
 */
const AxisField = ({ axis, label, value, step, onCommit }: AxisFieldProps) => {
  const { commit, gesture } = useNumberCommit(onCommit);
  return (
    <FlexRow align="center" gap={SPACING.xs} sx={{ flex: 1, minWidth: 0 }}>
      <Box component="span" aria-hidden sx={{ ...TYPOGRAPHY.mono.caption, color: AXIS_COLORS[axis], flexShrink: 0 }}>
        {axis.toUpperCase()}
      </Box>
      <InspectorValueInput
        ariaLabel={label}
        value={formatNumber(value)}
        onCommit={commit}
        scrub={{ step }}
        scrubGesture={gesture}
        grow
        minWidth={0}
      />
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
  const { t } = useTranslation();
  const commit = (axis: Axis) => (display: number) =>
    record({
      label: t("i18n-cont-model-editor-11.properties.change", { label: label.toLowerCase() }),
      mergeKey: `${objectUuid}:${label}:${axis}`,
      get: () => vector[axis],
      set: (v) => {
        vector[axis] = v;
      },
      value: fromDisplay(display)
    });
  const isDefault = AXES.every((a) => Math.abs(vector[a] - resetValue) < 1e-9);
  return (
    <FlexColumn fullWidth gap={SPACING.micro} sx={{ minWidth: 0 }}>
      <FlexRow align="center" justify="space-between" sx={{ minHeight: CONTROL.height.xs }}>
        <Label component="span" sx={{ mb: 0 }}>{label}</Label>
        <ToolbarIconButton
          icon={<RestartAltIcon sx={{ fontSize: ICON_SIZE.sm }} />}
          tooltip={t("i18n-cont-model-editor-11.properties.reset", { label: label.toLowerCase() })}
          size="small"
          disabled={isDefault}
          onClick={() =>
            record({
              label: t("i18n-cont-model-editor-11.properties.reset", { label: label.toLowerCase() }),
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
            value={toDisplay(vector[axis])}
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
  min?: number;
  max?: number;
  step: number;
}

// Ordered so common PBR controls come first; physical-only fields are skipped
// automatically when absent on the material.
const MATERIAL_NUMBER_FIELDS: readonly MaterialNumberSpec[] = [
  { key: "metalness", min: 0, max: 1, step: 0.05 },
  { key: "roughness", min: 0, max: 1, step: 0.05 },
  { key: "emissiveIntensity", min: 0, step: 0.05 },
  { key: "ior", min: 1, max: 2.333, step: 0.01 },
  { key: "reflectivity", min: 0, max: 1, step: 0.05 },
  { key: "specularIntensity", min: 0, max: 1, step: 0.05 },
  { key: "clearcoat", min: 0, max: 1, step: 0.05 },
  { key: "clearcoatRoughness", min: 0, max: 1, step: 0.05 },
  { key: "sheen", min: 0, max: 1, step: 0.05 },
  { key: "sheenRoughness", min: 0, max: 1, step: 0.05 },
  { key: "transmission", min: 0, max: 1, step: 0.05 },
  { key: "thickness", min: 0, step: 0.1 },
  { key: "iridescence", min: 0, max: 1, step: 0.05 },
  { key: "iridescenceIOR", min: 1, max: 2.333, step: 0.01 },
  { key: "dispersion", min: 0, step: 0.1 }
];

const MATERIAL_COLOR_FIELDS: readonly { key: string }[] = [
  { key: "color" },
  { key: "emissive" },
  { key: "sheenColor" },
  { key: "specularColor" },
  { key: "attenuationColor" }
];

// `recompile` fields change the shader program and require needsUpdate = true.
const MATERIAL_FLAG_FIELDS: readonly {
  key: string;
  recompile: boolean;
}[] = [
  { key: "transparent", recompile: true },
  { key: "wireframe", recompile: false },
  { key: "flatShading", recompile: true },
  { key: "vertexColors", recompile: true },
  { key: "depthTest", recompile: false },
  { key: "depthWrite", recompile: false }
];

const SIDE_OPTIONS = [
  { value: String(THREE.FrontSide), key: "front" },
  { value: String(THREE.BackSide), key: "back" },
  { value: String(THREE.DoubleSide), key: "double" }
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
  const { t } = useTranslation();
  const key = (field: string) => `${material.uuid}:${field}`;
  const setNumber = (field: string, label: string, value: number) =>
    record({
      label: t("i18n-cont-model-editor-11.properties.change", { label: label.toLowerCase() }),
      mergeKey: key(field),
      get: () => getNumberProp(bagOf(material), field) ?? 0,
      set: (v) => {
        setProp(bagOf(material), field, v);
      },
      value
    });
  return (
    <>
      <Caption>
        {material.name ? `${material.name} · ${material.type}` : material.type}
      </Caption>
      {MATERIAL_COLOR_FIELDS.map(({ key: field }) => {
        const color = getColorProp(bagOf(material), field);
        return color ? (
          <ColorRow key={field} label={t(`i18n-cont-model-editor-11.properties.materialColors.${field}`)} color={color} record={record} mergeKey={key(field)} />
        ) : null;
      })}
      {MATERIAL_NUMBER_FIELDS.map((spec) => {
        const current = getNumberProp(bagOf(material), spec.key);
        return current === undefined ? null : (
          <NumberRow
            key={spec.key}
            label={t(`i18n-cont-model-editor-11.properties.materialNumbers.${spec.key}`)}
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
              setNumber(spec.key, t(`i18n-cont-model-editor-11.properties.materialNumbers.${spec.key}`), next);
            }}
          />
        );
      })}
      <NumberRow
        label={t("i18n-cont-model-editor-11.properties.opacity")}
        value={material.opacity}
        min={0}
        max={1}
        step={0.05}
        onCommit={(v) =>
          record({
            label: t("i18n-cont-model-editor-11.properties.change", { label: t("i18n-cont-model-editor-11.properties.opacity").toLowerCase() }),
            mergeKey: key("opacity"),
            get: () => material.opacity,
            set: (o) => applyOpacity(material, o),
            value: THREE.MathUtils.clamp(v, 0, 1)
          })
        }
      />
      <NumberRow
        label={t("i18n-cont-model-editor-11.properties.alphaTest")}
        value={material.alphaTest}
        min={0}
        max={1}
        step={0.05}
        onCommit={(v) =>
          record({
            label: t("i18n-cont-model-editor-11.properties.change", { label: t("i18n-cont-model-editor-11.properties.alphaTest").toLowerCase() }),
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
      <InspectorFieldRow label={t("i18n-cont-model-editor-11.properties.side")}>
        <InspectorSelect
          grow
          label={t("i18n-cont-model-editor-11.properties.side")}
          value={String(material.side)}
          options={SIDE_OPTIONS.map((option) => ({ ...option, label: t(`i18n-cont-model-editor-11.properties.sideOptions.${option.key}`) }))}
          onChange={(v) =>
            record({
              label: t("i18n-cont-model-editor-11.properties.change", { label: t("i18n-cont-model-editor-11.properties.side").toLowerCase() }),
              get: () => material.side,
              set: (side) => {
                material.side = side;
                material.needsUpdate = true;
              },
              value: Number(v) as THREE.Side
            })
          }
        />
      </InspectorFieldRow>
      {MATERIAL_FLAG_FIELDS.map(({ key: field, recompile }) => {
        const checked = getBoolProp(bagOf(material), field);
        return checked === undefined ? null : (
          <ToggleRow
            key={field}
            label={t(`i18n-cont-model-editor-11.properties.materialFlags.${field}`)}
            checked={checked}
            onChange={(c) =>
              record({
                label: t("i18n-cont-model-editor-11.properties.toggle", { label: t(`i18n-cont-model-editor-11.properties.materialFlags.${field}`).toLowerCase() }),
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
  const { t } = useTranslation();
  const theme = useTheme();
  const [materialSlot, setMaterialSlot] = useState(0);
  // `tick` is intentionally a render trigger: bumping it re-renders this panel
  // so value inputs resync from objects mutated by gizmo drags.
  void tick;

  if (!object) {
    return (
      <FlexColumn className="properties-panel" fullHeight sx={{ width: "100%", minHeight: 0 }}>
        <EmptyState
          variant="empty"
          size="small"
          icon={<TouchAppOutlinedIcon />}
          title={t("i18n-cont-model-editor-11.properties.emptyTitle")}
          description={t("i18n-cont-model-editor-11.properties.emptyDescription")}
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
      label: t("i18n-cont-model-editor-11.properties.editGeometry"),
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
      label: t("i18n-cont-model-editor-11.properties.change", { label: label.toLowerCase() }),
      mergeKey: `${uuid}:${field}`,
      get: () => getNumberProp(bagOf(target), field) ?? 0,
      set: (v) => {
        setProp(bagOf(target), field, v);
      },
      value
    });

  const setFlag = (label: string, field: string, target: THREE.Object3D, value: boolean) =>
    record({
      label: t("i18n-cont-model-editor-11.properties.toggle", { label: label.toLowerCase() }),
      get: () => getBoolProp(bagOf(target), field) ?? false,
      set: (v) => {
        setProp(bagOf(target), field, v);
      },
      value
    });

  return (
    <FlexColumn className="properties-panel" fullHeight sx={{ width: "100%", minHeight: 0 }}>
      <FlexColumn css={headerStyles(theme)} gap={SPACING.xs} key={`header-${uuid}`}>
        <TextInput
          className="nodrag"
          label={t("i18n-cont-model-editor-11.properties.name")}
          hideLabel
          size="small"
          value={object.name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            record({
              label: t("i18n-cont-model-editor-11.properties.rename"),
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
            updates from gizmo drags are handled by InspectorValueInput's value sync. */}
        <FlexColumn key={uuid} fullWidth sx={{ px: SPACING.lg }}>
          <InspectorSection title={t("i18n-cont-model-editor-11.properties.transform")} divider={false}>
            <Vector3Row label={t("i18n-cont-model-editor-11.properties.position")} objectUuid={uuid} vector={object.position} step={0.1} resetValue={0} record={record} />
            <Vector3Row
              label={t("i18n-cont-model-editor-11.properties.rotation")}
              objectUuid={uuid}
              vector={object.rotation}
              toDisplay={toDegrees}
              fromDisplay={toRadians}
              step={1}
              resetValue={0}
              record={record}
            />
            <Vector3Row label={t("i18n-cont-model-editor-11.properties.scale")} objectUuid={uuid} vector={object.scale} step={0.1} resetValue={1} record={record} />
          </InspectorSection>

          {light && (
            <InspectorSection title={t("i18n-cont-model-editor-11.properties.light")}>
              <ColorRow label={t("i18n-cont-model-editor-11.properties.color")} color={light.color} record={record} mergeKey={`${uuid}:lightColor`} />
              <NumberRow
                label={t("i18n-cont-model-editor-11.properties.intensity")}
                value={light.intensity}
                min={0}
                step={0.1}
                onCommit={(v) => setNumber(t("i18n-cont-model-editor-11.properties.intensity"), "intensity", light, Math.max(0, v))}
              />
              {(pointLight ?? spotLight) && (
                <>
                  <NumberRow
                    label={t("i18n-cont-model-editor-11.properties.range")}
                    value={(pointLight ?? spotLight)?.distance ?? 0}
                    min={0}
                    step={0.5}
                    onCommit={(v) => setNumber(t("i18n-cont-model-editor-11.properties.range"), "distance", light, Math.max(0, v))}
                  />
                  <NumberRow
                    label={t("i18n-cont-model-editor-11.properties.decay")}
                    value={(pointLight ?? spotLight)?.decay ?? 2}
                    min={0}
                    step={0.1}
                    onCommit={(v) => setNumber(t("i18n-cont-model-editor-11.properties.decay"), "decay", light, Math.max(0, v))}
                  />
                </>
              )}
              {spotLight && (
                <>
                  <NumberRow
                    label={t("i18n-cont-model-editor-11.properties.angle")}
                    value={toDegrees(spotLight.angle)}
                    min={1}
                    max={90}
                    step={1}
                    onCommit={(v) => setNumber(t("i18n-cont-model-editor-11.properties.angle"), "angle", spotLight, toRadians(THREE.MathUtils.clamp(v, 1, 90)))}
                  />
                  <NumberRow
                    label={t("i18n-cont-model-editor-11.properties.penumbra")}
                    value={spotLight.penumbra}
                    min={0}
                    max={1}
                    step={0.05}
                    onCommit={(v) => setNumber(t("i18n-cont-model-editor-11.properties.penumbra"), "penumbra", spotLight, THREE.MathUtils.clamp(v, 0, 1))}
                  />
                </>
              )}
            </InspectorSection>
          )}

          {hasGeometry && mesh && geometryParams && isEditableGeometryType(geometryType) && (
            <InspectorSection title={t("i18n-cont-model-editor-11.properties.geometry")}>
              <Caption>{geometryType}</Caption>
              {GEOMETRY_PARAM_SPECS[geometryType].map((spec) => {
                const isAngle = spec.kind === "angle";
                const stored = geometryParams[spec.key];
                const value = isNumber(stored) ? stored : 0;
                const display = isAngle ? toDegrees(value) : value;
                return (
                  <NumberRow
                    key={spec.key}
                  label={t(`i18n-cont-model-editor-11.properties.geometryParams.${spec.key}`)}
                    value={display}
                    integer={spec.kind === "int"}
                    min={isAngle ? 0 : spec.min}
                    max={isAngle ? 360 : "max" in spec ? spec.max : undefined}
                    step={isAngle ? 1 : spec.step}
                    onCommit={rebuildGeometry(spec.key, isAngle)}
                  />
                );
              })}
            </InspectorSection>
          )}

          {material && (
            <InspectorSection title={t("i18n-cont-model-editor-11.properties.material")}>
              {materials.length > 1 && (
                <InspectorFieldRow label={t("i18n-cont-model-editor-11.properties.slot")}>
                  <InspectorSelect
                    grow
                    label={t("i18n-cont-model-editor-11.properties.materialSlot")}
                    value={String(slot)}
                    options={materials.map((m, i) => ({
                      value: String(i),
                      label: `${i}: ${m.name || m.type}`
                    }))}
                    onChange={(v) => setMaterialSlot(Number(v))}
                  />
                </InspectorFieldRow>
              )}
              <MaterialSection key={material.uuid} material={material} record={record} />
            </InspectorSection>
          )}

          <InspectorSection title={t("i18n-cont-model-editor-11.properties.rendering")}>
            <ToggleRow label={t("i18n-cont-model-editor-11.properties.visible")} checked={object.visible} onChange={(c) => setFlag(t("i18n-cont-model-editor-11.properties.visible"), "visible", object, c)} />
            {mesh && (
              <>
                <ToggleRow label={t("i18n-cont-model-editor-11.properties.castShadow")} checked={mesh.castShadow} onChange={(c) => setFlag(t("i18n-cont-model-editor-11.properties.castShadow"), "castShadow", mesh, c)} />
                <ToggleRow label={t("i18n-cont-model-editor-11.properties.receiveShadow")} checked={mesh.receiveShadow} onChange={(c) => setFlag(t("i18n-cont-model-editor-11.properties.receiveShadow"), "receiveShadow", mesh, c)} />
              </>
            )}
            <ToggleRow label={t("i18n-cont-model-editor-11.properties.frustumCull")} checked={object.frustumCulled} onChange={(c) => setFlag(t("i18n-cont-model-editor-11.properties.frustumCull"), "frustumCulled", object, c)} />
            <NumberRow
              label={t("i18n-cont-model-editor-11.properties.renderOrder")}
              value={object.renderOrder}
              integer
              step={1}
              onCommit={(v) => setNumber(t("i18n-cont-model-editor-11.properties.renderOrder"), "renderOrder", object, v)}
            />
          </InspectorSection>
        </FlexColumn>
      </ScrollArea>
    </FlexColumn>
  );
};

export default memo(PropertiesPanel);
