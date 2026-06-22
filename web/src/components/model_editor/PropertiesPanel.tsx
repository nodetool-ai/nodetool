/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useState } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import * as THREE from "three";
import {
  FlexColumn,
  FlexRow,
  Text,
  Divider,
  TextInput,
  ScrollArea,
  Checkbox,
  SelectField,
  TabGroup,
  TabPanel,
  type TabItem,
  NodeSlider
} from "../ui_primitives";
import ColorPicker from "../inputs/ColorPicker";
import {
  GEOMETRY_PARAM_SPECS,
  buildGeometry,
  isEditableGeometryType,
  readGeometryParams
} from "./geometryParams";

const styles = (theme: Theme) =>
  css({
    "&": { width: "100%", height: "100%", minHeight: 0 },
    ".section-title": {
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      color: theme.vars.palette.text.secondary,
      margin: "12px 8px 4px"
    },
    ".field-row": {
      padding: "2px 8px",
      gap: "6px",
      alignItems: "center"
    },
    ".field-label": {
      width: "72px",
      flexShrink: 0,
      color: theme.vars.palette.text.secondary
    },
    ".num-field .MuiInputBase-input": {
      padding: "4px 6px",
      fontSize: theme.fontSizeSmall
    },
    ".num-cell": { flex: 1, minWidth: 0 },
    ".slider": { flex: 1, margin: "0 8px", minWidth: 0 },
    ".slider-value": {
      width: "52px",
      flexShrink: 0,
      ".num-field": { width: "52px" }
    },
    ".color-row": {
      padding: "4px 8px",
      gap: "8px",
      alignItems: "center"
    },
    ".select-field": {
      flex: 1,
      ".MuiSelect-select": {
        padding: "4px 6px",
        fontSize: theme.fontSizeSmall
      },
      ".MuiSvgIcon-root": { fontSize: "var(--fontSizeNormal)" }
    },
    ".empty": { padding: "16px 8px" }
  });

const roundTo = (value: number, digits = 4): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

interface NumberFieldProps {
  value: number;
  onCommit: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  integer?: boolean;
}

const NumberField = ({
  value,
  onCommit,
  step = 0.1,
  min,
  max,
  integer = false
}: NumberFieldProps) => {
  const [text, setText] = useState(String(roundTo(value)));
  // Resync the text buffer when the external value changes (e.g. gizmo drag),
  // without clobbering in-progress typing. Adjusting state during render is the
  // React-recommended pattern for deriving state from a changing prop.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    const parsed = parseFloat(text);
    if (!Number.isFinite(parsed) || Math.abs(parsed - value) > 1e-6) {
      setText(String(roundTo(value)));
    }
  }

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      setText(next);
      const parsed = parseFloat(next);
      if (Number.isFinite(parsed)) {
        // Commit raw while typing; clamp/round on blur so multi-digit entry
        // (e.g. typing "12" into a min-3 field) isn't fought by the clamp.
        onCommit(integer ? Math.round(parsed) : parsed);
      }
    },
    [onCommit, integer]
  );

  const handleBlur = useCallback(() => {
    let parsed = parseFloat(text);
    if (!Number.isFinite(parsed)) {
      setText(String(roundTo(value)));
      return;
    }
    if (integer) {
      parsed = Math.round(parsed);
    }
    if (min !== undefined) {
      parsed = Math.max(min, parsed);
    }
    if (max !== undefined) {
      parsed = Math.min(max, parsed);
    }
    setText(String(integer ? parsed : roundTo(parsed)));
    onCommit(parsed);
  }, [text, value, integer, min, max, onCommit]);

  return (
    <TextInput
      className="num-field nodrag nowheel"
      type="number"
      size="small"
      inputProps={{ step }}
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
};

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
    <FlexRow className="field-row" fullWidth>
      <Text size="small" className="field-label">
        {label}
      </Text>
      {isSlider && (
        <NodeSlider
          className="slider"
          value={value}
          min={min}
          max={max}
          step={integer ? 1 : step ?? 0.01}
          onChange={(_e, v) => onCommit(Array.isArray(v) ? v[0] : v)}
        />
      )}
      <div className={isSlider ? "slider-value" : "num-cell"}>
        <NumberField
          value={value}
          onCommit={onCommit}
          step={step}
          min={min}
          max={max}
          integer={integer}
        />
      </div>
    </FlexRow>
  );
});

interface CheckboxRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const CheckboxRow = ({ label, checked, onChange }: CheckboxRowProps) => (
  <FlexRow className="field-row" fullWidth>
    <Text size="small" className="field-label">
      {label}
    </Text>
    <Checkbox checked={checked} onChange={(_e, c) => onChange(c)} />
  </FlexRow>
);

interface ColorRowProps {
  label: string;
  color: THREE.Color;
  onChange: () => void;
}

const ColorRow = ({ label, color, onChange }: ColorRowProps) => (
  <FlexRow className="color-row" fullWidth>
    <Text size="small" className="field-label">
      {label}
    </Text>
    <ColorPicker
      showCustom
      color={`#${color.getHexString()}`}
      onColorChange={(c) => {
        if (c) {
          color.set(c);
          onChange();
        }
      }}
    />
  </FlexRow>
);

interface Vector3RowProps {
  label: string;
  vector: THREE.Vector3 | THREE.Euler;
  toDisplay?: (v: number) => number;
  fromDisplay?: (v: number) => number;
  step?: number;
  onChanged: () => void;
}

const Vector3Row = ({
  label,
  vector,
  toDisplay = (v) => v,
  fromDisplay = (v) => v,
  step,
  onChanged
}: Vector3RowProps) => {
  const commit = (axis: "x" | "y" | "z") => (value: number) => {
    vector[axis] = fromDisplay(value);
    onChanged();
  };
  return (
    <FlexRow className="field-row" fullWidth>
      <Text size="small" className="field-label">
        {label}
      </Text>
      <NumberField value={toDisplay(vector.x)} onCommit={commit("x")} step={step} />
      <NumberField value={toDisplay(vector.y)} onCommit={commit("y")} step={step} />
      <NumberField value={toDisplay(vector.z)} onCommit={commit("z")} step={step} />
    </FlexRow>
  );
};

// --- Typed-but-dynamic property access -------------------------------------
// Material fields differ by material type (Standard vs Physical vs loaded GLTF
// materials). These helpers read/write a property only when it is actually
// present with the expected runtime type, so the panel adapts to whatever
// material the selected mesh carries without `any`.
const getNumberProp = (obj: Record<string, unknown>, key: string): number | undefined => {
  const v = obj[key];
  return typeof v === "number" ? v : undefined;
};

const setNumberProp = (obj: Record<string, unknown>, key: string, value: number): void => {
  obj[key] = value;
};

const getColorProp = (obj: Record<string, unknown>, key: string): THREE.Color | undefined => {
  const v = obj[key];
  return v instanceof THREE.Color ? v : undefined;
};

const getBoolProp = (obj: Record<string, unknown>, key: string): boolean | undefined => {
  const v = obj[key];
  return typeof v === "boolean" ? v : undefined;
};

const setBoolProp = (obj: Record<string, unknown>, key: string, value: boolean): void => {
  obj[key] = value;
};

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
  { key: "emissiveIntensity", label: "Emissive", min: 0, step: 0.05 },
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
  { key: "color", label: "Color" },
  { key: "emissive", label: "Emissive" },
  { key: "sheenColor", label: "Sheen Col" },
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
  { key: "vertexColors", label: "Vertex Cols", recompile: true },
  { key: "depthTest", label: "Depth Test", recompile: false },
  { key: "depthWrite", label: "Depth Write", recompile: false }
];

const SIDE_OPTIONS = [
  { value: String(THREE.FrontSide), label: "Front" },
  { value: String(THREE.BackSide), label: "Back" },
  { value: String(THREE.DoubleSide), label: "Double" }
] as const;

interface PropertiesPanelProps {
  object: THREE.Object3D | null;
  /** Bump to force re-read of mutated object values (e.g. after gizmo drag). */
  tick: number;
  onChanged: () => void;
}

const PropertiesPanel = ({ object, tick, onChanged }: PropertiesPanelProps) => {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState("object");
  // `tick` is intentionally a render trigger: bumping it re-renders this panel
  // so NumberField inputs resync from objects mutated by gizmo drags.
  void tick;

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (object) {
        object.name = e.target.value;
        onChanged();
      }
    },
    [object, onChanged]
  );

  if (!object) {
    return (
      <FlexColumn css={styles(theme)} className="properties-panel" fullHeight>
        <Text size="small" color="secondary" className="empty">
          Select an object to edit its properties
        </Text>
      </FlexColumn>
    );
  }

  const mesh = object instanceof THREE.Mesh ? object : null;
  const material =
    mesh && !Array.isArray(mesh.material) ? mesh.material : null;
  const light = object instanceof THREE.Light ? object : null;
  const pointLight =
    object instanceof THREE.PointLight ? object : null;

  const geometryType = mesh?.geometry.type;
  const geometryParams = mesh ? readGeometryParams(mesh.geometry) : null;

  const rebuildGeometry = (key: string, isAngle: boolean) => (display: number) => {
    if (!mesh || !isEditableGeometryType(geometryType)) {
      return;
    }
    const raw = isAngle ? THREE.MathUtils.degToRad(display) : display;
    const next = { ...readGeometryParams(mesh.geometry), [key]: raw };
    const rebuilt = buildGeometry(geometryType, next);
    mesh.geometry.dispose();
    mesh.geometry = rebuilt;
    onChanged();
  };

  const hasGeometry =
    !!mesh && !!geometryParams && isEditableGeometryType(geometryType);
  const tabs: TabItem[] = [{ value: "object", label: "Object" }];
  if (hasGeometry) {
    tabs.push({ value: "geometry", label: "Geometry" });
  }
  if (material) {
    tabs.push({ value: "material", label: "Material" });
  }
  // Fall back to the Object tab when the active one isn't available for the
  // newly selected object (e.g. a light has no geometry/material tab).
  const effectiveTab = tabs.some((t) => t.value === activeTab)
    ? activeTab
    : "object";

  return (
    <FlexColumn css={styles(theme)} className="properties-panel" fullHeight>
      <TabGroup
        className="properties-tabs"
        size="small"
        fullWidth
        tabs={tabs}
        value={effectiveTab}
        onChange={setActiveTab}
      />
      <ScrollArea>
        {/* Remount fields only when the selected object changes; live value
            updates from gizmo drags are handled by NumberField's value sync. */}
        <FlexColumn key={object.uuid} fullWidth>
          <TabPanel value="object" activeValue={effectiveTab}>
          <FlexRow className="field-row" fullWidth>
            <Text size="small" className="field-label">
              Name
            </Text>
            <TextInput
              className="num-field nodrag"
              size="small"
              value={object.name}
              onChange={handleNameChange}
            />
          </FlexRow>
          <Text size="tiny" color="secondary" sx={{ padding: "0 8px" }}>
            {object.type}
          </Text>
          <CheckboxRow
            label="Visible"
            checked={object.visible}
            onChange={(c) => {
              object.visible = c;
              onChanged();
            }}
          />
          <CheckboxRow
            label="Frustum Cull"
            checked={object.frustumCulled}
            onChange={(c) => {
              object.frustumCulled = c;
              onChanged();
            }}
          />
          <NumberRow
            label="Render Ord"
            value={object.renderOrder}
            integer
            step={1}
            onCommit={(v) => {
              object.renderOrder = v;
              onChanged();
            }}
          />
          {mesh && (
            <>
              <CheckboxRow
                label="Cast Shadow"
                checked={mesh.castShadow}
                onChange={(c) => {
                  mesh.castShadow = c;
                  onChanged();
                }}
              />
              <CheckboxRow
                label="Recv Shadow"
                checked={mesh.receiveShadow}
                onChange={(c) => {
                  mesh.receiveShadow = c;
                  onChanged();
                }}
              />
            </>
          )}

          <Divider />
          <Text size="small" weight={600} className="section-title">
            Transform
          </Text>
          <Vector3Row label="Position" vector={object.position} step={0.1} onChanged={onChanged} />
          <Vector3Row
            label="Rotation"
            vector={object.rotation}
            toDisplay={THREE.MathUtils.radToDeg}
            fromDisplay={THREE.MathUtils.degToRad}
            step={1}
            onChanged={onChanged}
          />
          <Vector3Row label="Scale" vector={object.scale} step={0.1} onChanged={onChanged} />

          {light && (
            <>
              <Divider />
              <Text size="small" weight={600} className="section-title">
                Light
              </Text>
              <ColorRow label="Color" color={light.color} onChange={onChanged} />
              <NumberRow
                label="Intensity"
                value={light.intensity}
                min={0}
                step={0.1}
                onCommit={(v) => {
                  light.intensity = Math.max(0, v);
                  onChanged();
                }}
              />
              {pointLight && (
                <>
                  <NumberRow
                    label="Distance"
                    value={pointLight.distance}
                    min={0}
                    step={0.5}
                    onCommit={(v) => {
                      pointLight.distance = Math.max(0, v);
                      onChanged();
                    }}
                  />
                  <NumberRow
                    label="Decay"
                    value={pointLight.decay}
                    min={0}
                    step={0.1}
                    onCommit={(v) => {
                      pointLight.decay = Math.max(0, v);
                      onChanged();
                    }}
                  />
                </>
              )}
            </>
          )}
          </TabPanel>

          <TabPanel value="geometry" activeValue={effectiveTab}>
          {mesh && geometryParams && isEditableGeometryType(geometryType) && (
            <>
              <Text size="tiny" color="secondary" sx={{ padding: "0 8px 4px" }}>
                {geometryType}
              </Text>
              {GEOMETRY_PARAM_SPECS[geometryType].map((spec) => {
                const isAngle = spec.kind === "angle";
                const stored = geometryParams[spec.key];
                const value = typeof stored === "number" ? stored : 0;
                const display = isAngle ? THREE.MathUtils.radToDeg(value) : value;
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
            </>
          )}
          </TabPanel>

          <TabPanel value="material" activeValue={effectiveTab}>
          {material && (
            <>
              <Text size="tiny" color="secondary" sx={{ padding: "0 8px 4px" }}>
                {material.type}
              </Text>

              {MATERIAL_COLOR_FIELDS.map(({ key, label }) => {
                const color = getColorProp(material, key);
                return color ? (
                  <ColorRow
                    key={key}
                    label={label}
                    color={color}
                    onChange={onChanged}
                  />
                ) : null;
              })}

              {MATERIAL_NUMBER_FIELDS.map((spec) => {
                const current = getNumberProp(material, spec.key);
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
                      if (spec.min !== undefined) next = Math.max(spec.min, next);
                      if (spec.max !== undefined) next = Math.min(spec.max, next);
                      setNumberProp(material, spec.key, next);
                      onChanged();
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
                onCommit={(v) => {
                  const clamped = THREE.MathUtils.clamp(v, 0, 1);
                  material.opacity = clamped;
                  if (clamped < 1) {
                    material.transparent = true;
                  }
                  material.needsUpdate = true;
                  onChanged();
                }}
              />
              <NumberRow
                label="Alpha Test"
                value={material.alphaTest}
                min={0}
                max={1}
                step={0.05}
                onCommit={(v) => {
                  material.alphaTest = THREE.MathUtils.clamp(v, 0, 1);
                  material.needsUpdate = true;
                  onChanged();
                }}
              />

              <FlexRow className="field-row" fullWidth>
                <Text size="small" className="field-label">
                  Side
                </Text>
                <SelectField
                  className="select-field nodrag"
                  hideLabel
                  label="Side"
                  size="small"
                  variant="standard"
                  value={String(material.side)}
                  options={SIDE_OPTIONS}
                  onChange={(v) => {
                    material.side = Number(v) as THREE.Side;
                    material.needsUpdate = true;
                    onChanged();
                  }}
                />
              </FlexRow>

              {MATERIAL_FLAG_FIELDS.map(({ key, label, recompile }) => {
                const checked = getBoolProp(material, key);
                return checked === undefined ? null : (
                  <CheckboxRow
                    key={key}
                    label={label}
                    checked={checked}
                    onChange={(c) => {
                      setBoolProp(material, key, c);
                      if (recompile) {
                        material.needsUpdate = true;
                      }
                      onChanged();
                    }}
                  />
                );
              })}
            </>
          )}
          </TabPanel>
        </FlexColumn>
      </ScrollArea>
    </FlexColumn>
  );
};

export default memo(PropertiesPanel);
