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
  Checkbox
} from "../ui_primitives";
import ColorPicker from "../inputs/ColorPicker";

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
      width: "64px",
      flexShrink: 0,
      color: theme.vars.palette.text.secondary
    },
    ".num-field .MuiInputBase-input": {
      padding: "4px 6px",
      fontSize: theme.fontSizeSmall
    },
    ".color-row": {
      padding: "4px 8px",
      gap: "8px",
      alignItems: "center"
    },
    ".empty": { padding: "16px 8px" }
  });

interface NumberFieldProps {
  value: number;
  onCommit: (value: number) => void;
  step?: number;
}

const NumberField = ({ value, onCommit, step = 0.1 }: NumberFieldProps) => {
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
        onCommit(parsed);
      }
    },
    [onCommit]
  );

  return (
    <TextInput
      className="num-field nodrag nowheel"
      type="number"
      size="small"
      inputProps={{ step }}
      value={text}
      onChange={handleChange}
    />
  );
};

const roundTo = (value: number, digits = 4): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

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

interface PropertiesPanelProps {
  object: THREE.Object3D | null;
  /** Bump to force re-read of mutated object values (e.g. after gizmo drag). */
  tick: number;
  onChanged: () => void;
}

const colorToHex = (color: THREE.Color): string => `#${color.getHexString()}`;

const PropertiesPanel = ({ object, tick, onChanged }: PropertiesPanelProps) => {
  const theme = useTheme();
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
    mesh && !Array.isArray(mesh.material)
      ? (mesh.material as THREE.Material & {
          color?: THREE.Color;
          wireframe?: boolean;
          metalness?: number;
          roughness?: number;
          opacity: number;
          transparent: boolean;
        })
      : null;
  const light = object instanceof THREE.Light ? object : null;

  return (
    <FlexColumn css={styles(theme)} className="properties-panel" fullHeight>
      <ScrollArea>
        {/* Remount fields only when the selected object changes; live value
            updates from gizmo drags are handled by NumberField's value sync. */}
        <FlexColumn key={object.uuid} fullWidth>
          <Text size="small" weight={600} className="section-title">
            Object
          </Text>
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

          {material && (
            <>
              <Divider />
              <Text size="small" weight={600} className="section-title">
                Material
              </Text>
              {material.color && (
                <FlexRow className="color-row" fullWidth>
                  <Text size="small" className="field-label">
                    Color
                  </Text>
                  <ColorPicker
                    showCustom
                    color={colorToHex(material.color)}
                    onColorChange={(c) => {
                      if (c && material.color) {
                        material.color.set(c);
                        onChanged();
                      }
                    }}
                  />
                </FlexRow>
              )}
              <FlexRow className="field-row" fullWidth>
                <Text size="small" className="field-label">
                  Wireframe
                </Text>
                <Checkbox
                  checked={!!material.wireframe}
                  onChange={(_e, checked) => {
                    material.wireframe = checked;
                    onChanged();
                  }}
                />
              </FlexRow>
              {typeof material.metalness === "number" && (
                <FlexRow className="field-row" fullWidth>
                  <Text size="small" className="field-label">
                    Metalness
                  </Text>
                  <NumberField
                    value={material.metalness}
                    step={0.05}
                    onCommit={(v) => {
                      material.metalness = THREE.MathUtils.clamp(v, 0, 1);
                      onChanged();
                    }}
                  />
                </FlexRow>
              )}
              {typeof material.roughness === "number" && (
                <FlexRow className="field-row" fullWidth>
                  <Text size="small" className="field-label">
                    Roughness
                  </Text>
                  <NumberField
                    value={material.roughness}
                    step={0.05}
                    onCommit={(v) => {
                      material.roughness = THREE.MathUtils.clamp(v, 0, 1);
                      onChanged();
                    }}
                  />
                </FlexRow>
              )}
              <FlexRow className="field-row" fullWidth>
                <Text size="small" className="field-label">
                  Opacity
                </Text>
                <NumberField
                  value={material.opacity}
                  step={0.05}
                  onCommit={(v) => {
                    const clamped = THREE.MathUtils.clamp(v, 0, 1);
                    material.opacity = clamped;
                    material.transparent = clamped < 1;
                    material.needsUpdate = true;
                    onChanged();
                  }}
                />
              </FlexRow>
            </>
          )}

          {light && (
            <>
              <Divider />
              <Text size="small" weight={600} className="section-title">
                Light
              </Text>
              <FlexRow className="color-row" fullWidth>
                <Text size="small" className="field-label">
                  Color
                </Text>
                <ColorPicker
                  showCustom
                  color={colorToHex(light.color)}
                  onColorChange={(c) => {
                    if (c) {
                      light.color.set(c);
                      onChanged();
                    }
                  }}
                />
              </FlexRow>
              <FlexRow className="field-row" fullWidth>
                <Text size="small" className="field-label">
                  Intensity
                </Text>
                <NumberField
                  value={light.intensity}
                  step={0.1}
                  onCommit={(v) => {
                    light.intensity = Math.max(0, v);
                    onChanged();
                  }}
                />
              </FlexRow>
            </>
          )}
        </FlexColumn>
      </ScrollArea>
    </FlexColumn>
  );
};

export default memo(PropertiesPanel);
