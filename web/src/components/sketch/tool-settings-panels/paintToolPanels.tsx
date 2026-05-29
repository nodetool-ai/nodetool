import React, { memo, useState } from "react";
import { Slider } from "@mui/material";
import { Box, Text } from "../../ui_primitives";
import { EditorButton } from "../../editor_ui";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import {
  BrushSettings,
  BrushType,
  createStrokeAssistPreset,
  EraserMode,
  EraserSettings,
  PencilSettings,
  resolveStrokeAssistSettings,
  StrokeAssistPreset,
  StrokeAssistSettings
} from "../types";
import { sketchSliderSx, SKETCH_SPACING } from "../sketchStyles";
import { effectiveEraserMode } from "./shared";
import { SketchModeToggle, SketchModeOption } from "./SketchModeToggle";

/**
 * Wraps a conceptual subgroup of tool-settings (e.g. paint params,
 * stroke assist) so that the top bar's flex-wrap treats the whole
 * group as one unit. Without this, the top bar's flat layout means
 * an extra row inside one group (Round/Angle for round brushes) can
 * push rows from the next group into a different visual line — items
 * appear to "jump" when switching brush type. Each SettingGroup runs
 * its own internal flex-wrap and never splits across the top bar's
 * wrap boundary except as a complete unit.
 */
const SETTING_GROUP_SX = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap" as const,
  columnGap: SKETCH_SPACING.lg,
  rowGap: SKETCH_SPACING.sm
};

const SettingGroup: React.FC<{ children: React.ReactNode }> = ({
  children
}) => <Box sx={SETTING_GROUP_SX}>{children}</Box>;

/**
 * Inside a `flex-wrap: wrap` parent, an element with `flexBasis: 100%`
 * forces every following flex item onto a new line. We use this to make
 * the stroke-assist group always start on its own row, regardless of how
 * many sliders the first row currently shows. Without it, the assist
 * preset toggle gets pushed back onto row 1 whenever the user picks
 * Air/Spray (which removes the Round + Angle sliders).
 */
const RowBreak = () => (
  <Box aria-hidden sx={{ flexBasis: "100%", height: 0, m: 0, p: 0 }} />
);

const AdvancedToggleButton: React.FC<{
  open: boolean;
  onToggle: () => void;
}> = ({ open, onToggle }) => (
  <EditorButton
    size="small"
    variant="text"
    onClick={onToggle}
    aria-pressed={open}
    aria-label="Toggle advanced stroke options"
    sx={{
      minWidth: 0,
      padding: `${SKETCH_SPACING.xs} ${SKETCH_SPACING.sm}`,
      // Force the button to ride at the end of row 1 (after the paint-
      // params group) so it stays anchored beside the controls it
      // governs. Without this it could be pushed onto row 2 by the
      // wrap, which would defeat the purpose.
      whiteSpace: "nowrap"
    }}
    startIcon={open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
  >
    Advanced
  </EditorButton>
);

interface BrushSettingsPanelProps {
  settings: BrushSettings;
  onChange: (settings: Partial<BrushSettings>) => void;
  /** Hide size + brush opacity (e.g. eraser uses `toolSettings.eraser` for those). */
  omitPaintSliders?: boolean;
  /** Hide stroke assist; eraser keeps assist on `toolSettings.eraser` only (see EraserEngine). */
  omitStrokeAssist?: boolean;
}

interface PencilSettingsPanelProps {
  settings: PencilSettings;
  onChange: (settings: Partial<PencilSettings>) => void;
  /** Hide size + pencil opacity (e.g. eraser uses `toolSettings.eraser` for those). */
  omitPaintSliders?: boolean;
  /** Hide stroke assist; eraser keeps assist on `toolSettings.eraser` only (see EraserEngine). */
  omitStrokeAssist?: boolean;
}

interface EraserSettingsPanelProps {
  settings: EraserSettings;
  onChange: (settings: Partial<EraserSettings>) => void;
}

interface StrokeAssistToolSettings {
  stabilizer: number;
  strokeAssist?: StrokeAssistSettings;
}

interface StrokeAssistSettingsPanelProps<T extends StrokeAssistToolSettings> {
  settings: T;
  onChange: (settings: Partial<T>) => void;
}

/**
 * Stroke-assist UI groups everything under one "Assist" segmented control to
 * eliminate the previous three-stack layout (preset | mode | snap) which had
 * duplicated "Smooth/Lazy" labels with different meanings (preset vs. mode).
 *
 * Topology, in order:
 *  1. Assist:    [Off | Smooth | Lazy | Ink | Custom]
 *  2. Strength:  slider              (hidden when Off)
 *  3. Algorithm: [Stabilizer | Drag] (only when Custom; renamed to avoid the
 *                                     name clash with presets)
 *  4. Snap:      [Free | 15° | 30° | 45° | 90°]  (merges old Free/Angle
 *                                                  toggle + increment into one)
 *  5. Snap %:    slider              (hidden when Free)
 *
 * "Off" is a UI-only state: it sets strength=0 and snapMode="off" but keeps
 * `preset = "custom"` internally so the data model doesn't need a new enum.
 */
const STROKE_ASSIST_PRESETS: Array<{
  value: Exclude<StrokeAssistPreset, "custom">;
  label: string;
  tooltip: string;
}> = [
  {
    value: "smooth",
    label: "Smooth",
    tooltip:
      "Rolling-average stabilizer. Filters jitter while the tip keeps following the cursor — good for general drawing."
  },
  {
    value: "lazy",
    label: "Lazy",
    tooltip:
      "Rope/leash. Tip stays still until the cursor exceeds a dead-zone radius, then trails behind in a straight line. Best for slow, deliberate inking."
  },
  {
    value: "inking",
    label: "Ink",
    tooltip:
      "Lazy leash + 45° angle snap. Long strokes lock to nearest 45° direction — for clean axis-aligned linework."
  }
];

const STROKE_ASSIST_ANGLE_OPTIONS = [15, 30, 45, 90];

type AssistUiPreset = "off" | "smooth" | "lazy" | "inking" | "custom";

function resolveAssistUiPreset(assist: StrokeAssistSettings): AssistUiPreset {
  if (assist.strength <= 0 && assist.snapMode === "off") {
    return "off";
  }
  if (assist.preset === "custom") {
    return "custom";
  }
  return assist.preset;
}

function StrokeAssistSettingsPanel<T extends StrokeAssistToolSettings>({
  settings,
  onChange
}: StrokeAssistSettingsPanelProps<T>) {
  const assist = resolveStrokeAssistSettings(
    settings.stabilizer,
    settings.strokeAssist
  );
  const uiPreset = resolveAssistUiPreset(assist);
  const assistOn = uiPreset !== "off";
  const snapOn = assist.snapMode === "angle";
  // Currently selected snap value for the merged Snap toggle. "off" doubles
  // as "Free"; numeric values map to angle-mode with that increment.
  const snapValue: "off" | number = snapOn ? assist.angleIncrement : "off";

  const pushAssist = (nextAssist: StrokeAssistSettings) => {
    onChange({
      strokeAssist: nextAssist,
      stabilizer: nextAssist.mode === "stabilizer" ? nextAssist.strength : 0
    } as Partial<T>);
  };

  const updateAssist = (partial: Partial<StrokeAssistSettings>) => {
    pushAssist({
      ...assist,
      ...partial,
      preset: "custom"
    });
  };

  const handlePresetChange = (next: AssistUiPreset) => {
    if (next === uiPreset) {
      return;
    }
    if (next === "off") {
      // Off: zero out strength and disable snap, but keep mode/angle so a
      // future re-enable doesn't forget the user's prior tuning.
      pushAssist({
        ...assist,
        preset: "custom",
        strength: 0,
        snapMode: "off"
      });
      return;
    }
    if (next === "custom") {
      // Promote whatever is currently in effect to "custom" so the
      // Algorithm row appears and edits don't bounce back to a preset.
      pushAssist({ ...assist, preset: "custom" });
      return;
    }
    pushAssist(createStrokeAssistPreset(next));
  };

  return (
    <SettingGroup>
      <SketchModeToggle
        value={uiPreset}
        onChange={(_, v) => {
          if (v) {
            handlePresetChange(v as AssistUiPreset);
          }
        }}
        sx={{ flexWrap: "wrap" }}
      >
        <SketchModeOption
          value="off"
          title="No stroke assist. Tip follows the raw pointer."
        >
          Off
        </SketchModeOption>
        {STROKE_ASSIST_PRESETS.map(({ value, label, tooltip }) => (
          <SketchModeOption key={value} value={value} title={tooltip}>
            {label}
          </SketchModeOption>
        ))}
        <SketchModeOption
          value="custom"
          title="Tune algorithm, strength and angle snap manually."
        >
          Custom
        </SketchModeOption>
      </SketchModeToggle>
      {assistOn && (
        <Box className="setting-row">
          <Text className="setting-label">Strength</Text>
          <Slider
            sx={sketchSliderSx}
            size="small"
            min={0}
            max={1}
            step={0.01}
            value={assist.strength}
            onChange={(_, v) => updateAssist({ strength: v as number })}
          />
          <Text className="setting-value">
            {Math.round(assist.strength * 100)}%
          </Text>
        </Box>
      )}
      {uiPreset === "custom" && (
        // Algorithm = the underlying stroke-assist mode. Labels are
        // deliberately *not* "Smooth/Lazy" — those collide with preset
        // names. "Stabilizer" smooths points in place; "Drag" trails the
        // cursor (formerly the "lazy" mode).
        <SketchModeToggle
          value={assist.mode}
          onChange={(_, v) => {
            if (v) {
              updateAssist({ mode: v as StrokeAssistSettings["mode"] });
            }
          }}
        >
          <SketchModeOption
            value="stabilizer"
            title="Rolling-average smoothing — tip follows the cursor along a low-pass-filtered path."
          >
            Stabilizer
          </SketchModeOption>
          <SketchModeOption
            value="lazy"
            title="Leash drag — tip stays put inside a dead-zone, then trails the cursor along a straight line."
          >
            Drag
          </SketchModeOption>
        </SketchModeToggle>
      )}
      <SketchModeToggle
        value={snapValue}
        onChange={(_, v) => {
          if (v === "off") {
            updateAssist({ snapMode: "off" });
          } else if (typeof v === "number") {
            updateAssist({ snapMode: "angle", angleIncrement: v });
          }
        }}
        sx={{ flexWrap: "wrap" }}
      >
        <SketchModeOption value="off" title="No angle snap.">
          Free
        </SketchModeOption>
        {STROKE_ASSIST_ANGLE_OPTIONS.map((angle) => (
          <SketchModeOption
            key={angle}
            value={angle}
            title={`Snap stroke direction to nearest ${angle}°.`}
          >
            {angle}°
          </SketchModeOption>
        ))}
      </SketchModeToggle>
      {snapOn && (
        <Box className="setting-row">
          <Text className="setting-label">Snap</Text>
          <Slider
            sx={sketchSliderSx}
            size="small"
            min={0}
            max={1}
            step={0.01}
            value={assist.snapStrength}
            onChange={(_, v) => updateAssist({ snapStrength: v as number })}
          />
          <Text className="setting-value">
            {Math.round(assist.snapStrength * 100)}%
          </Text>
        </Box>
      )}
    </SettingGroup>
  );
}

export const BrushSettingsPanel = memo(function BrushSettingsPanel({
  settings,
  onChange,
  omitPaintSliders = false,
  omitStrokeAssist = false
}: BrushSettingsPanelProps) {
  // Local UI state — we only need to remember the disclosure across
  // re-renders of the same panel instance. Switching to a different tool
  // unmounts the panel and naturally resets to "collapsed", which is the
  // intended default since most users don't change assist often.
  const [showAdvanced, setShowAdvanced] = useState(false);
  return (
    <>
      {/* Group 1 — Brush type. Stays in its own wrap-row so changing it
          never reflows the slider groups below. */}
      <SettingGroup>
        <SketchModeToggle
          value={settings.brushType || "round"}
          onChange={(_, v) => {
            if (v) {
              onChange({ brushType: v as BrushType });
            }
          }}
        >
          <SketchModeOption value="round">Round</SketchModeOption>
          <SketchModeOption value="soft">Soft</SketchModeOption>
          <SketchModeOption value="airbrush">Air</SketchModeOption>
          <SketchModeOption value="spray">Spray</SketchModeOption>
        </SketchModeToggle>
      </SettingGroup>
      {/* Group 2 — Paint params. Size/Opacity/Hard are always present;
          Round/Angle appear only for round + soft brushes but stay
          contained in the same group so the Stroke-Assist group below
          doesn't slide left when they disappear. */}
      <SettingGroup>
        {!omitPaintSliders && (
          <>
            <Box className="setting-row setting-row--wide">
              <Text className="setting-label">Size</Text>
              <Slider
                sx={sketchSliderSx}
                size="small"
                min={1}
                max={200}
                value={settings.size}
                onChange={(_, v) => onChange({ size: v as number })}
              />
              <Text className="setting-value">{settings.size}</Text>
            </Box>
            <Box className="setting-row">
              <Text className="setting-label">Opacity</Text>
              <Slider
                sx={sketchSliderSx}
                size="small"
                min={0}
                max={1}
                step={0.01}
                value={settings.opacity}
                onChange={(_, v) => onChange({ opacity: v as number })}
              />
              <Text className="setting-value">
                {Math.round(settings.opacity * 100)}%
              </Text>
            </Box>
          </>
        )}
        <Box className="setting-row">
          <Text className="setting-label">Hard</Text>
          <Slider
            sx={sketchSliderSx}
            size="small"
            min={0}
            max={1}
            step={0.01}
            value={settings.hardness}
            onChange={(_, v) => onChange({ hardness: v as number })}
          />
          <Text className="setting-value">
            {Math.round(settings.hardness * 100)}%
          </Text>
        </Box>
        {(settings.brushType === "round" || settings.brushType === "soft") && (
          <>
            <Box className="setting-row">
              <Text className="setting-label">Round</Text>
              <Slider
                sx={sketchSliderSx}
                size="small"
                min={0.1}
                max={1}
                step={0.01}
                value={settings.roundness ?? 1.0}
                onChange={(_, v) => onChange({ roundness: v as number })}
              />
              <Text className="setting-value">
                {Math.round((settings.roundness ?? 1.0) * 100)}%
              </Text>
            </Box>
            <Box className="setting-row">
              <Text className="setting-label">Angle</Text>
              <Slider
                sx={sketchSliderSx}
                size="small"
                min={0}
                max={360}
                step={1}
                value={settings.angle ?? 0}
                onChange={(_, v) => onChange({ angle: v as number })}
              />
              <Text className="setting-value">
                {settings.angle ?? 0}°
              </Text>
            </Box>
          </>
        )}
        {!omitStrokeAssist && (
          <AdvancedToggleButton
            open={showAdvanced}
            onToggle={() => setShowAdvanced((v) => !v)}
          />
        )}
      </SettingGroup>
      {/* Group 3 — Stroke assist. Forced onto row 2 via RowBreak so it
          never piggybacks on row 1 when the user toggles to a brush
          type with fewer sliders. Hidden behind the Advanced disclosure
          to keep the default UI focused on the common paint params. */}
      {!omitStrokeAssist && showAdvanced ? (
        <>
          <RowBreak />
          <StrokeAssistSettingsPanel settings={settings} onChange={onChange} />
        </>
      ) : null}
    </>
  );
});

export const PencilSettingsPanel = memo(function PencilSettingsPanel({
  settings,
  onChange,
  omitPaintSliders = false,
  omitStrokeAssist = false
}: PencilSettingsPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const pixelMode: "pixel" | "soft" =
    (settings.pixelPerfect ?? true) ? "pixel" : "soft";
  return (
    <>
      <SettingGroup>
        <SketchModeToggle
          value={pixelMode}
          onChange={(_, v) => {
            if (v) {
              onChange({ pixelPerfect: v === "pixel" });
            }
          }}
        >
          <SketchModeOption
            value="pixel"
            title="Pixel-art mode. Each dab is a crisp N×N square centered on the pixel under the cursor."
          >
            Pixel
          </SketchModeOption>
          <SketchModeOption
            value="soft"
            title="Soft mode. Antialiased circular dabs — feels like a small brush."
          >
            Soft
          </SketchModeOption>
        </SketchModeToggle>
        {!omitPaintSliders && (
          <>
            <Box className="setting-row setting-row--wide">
              <Text className="setting-label">Size</Text>
              <Slider
                sx={sketchSliderSx}
                size="small"
                min={1}
                max={10}
                value={settings.size}
                onChange={(_, v) => onChange({ size: v as number })}
              />
              <Text className="setting-value">{settings.size}</Text>
            </Box>
            <Box className="setting-row">
              <Text className="setting-label">Opacity</Text>
              <Slider
                sx={sketchSliderSx}
                size="small"
                min={0}
                max={1}
                step={0.01}
                value={settings.opacity}
                onChange={(_, v) => onChange({ opacity: v as number })}
              />
              <Text className="setting-value">
                {Math.round(settings.opacity * 100)}%
              </Text>
            </Box>
          </>
        )}
        {!omitStrokeAssist && (
          <AdvancedToggleButton
            open={showAdvanced}
            onToggle={() => setShowAdvanced((v) => !v)}
          />
        )}
      </SettingGroup>
      {!omitStrokeAssist && showAdvanced ? (
        <>
          <RowBreak />
          <StrokeAssistSettingsPanel settings={settings} onChange={onChange} />
        </>
      ) : null}
    </>
  );
});

export const EraserSettingsPanel = memo(function EraserSettingsPanel({
  settings,
  onChange
}: EraserSettingsPanelProps) {
  const mode = effectiveEraserMode(settings);
  // Eraser doesn't expose the full stroke-assist surface (presets,
  // algorithm, angle snap) — those are overkill for erasing. We keep a
  // single "Stabilizer" slider that drives the same underlying field so
  // erases still get smoothed when desired. Snap is forced off and mode
  // is forced to stabilizer so the simplified UI never produces a
  // confusing state via leftover values from prior advanced edits.
  const assist = resolveStrokeAssistSettings(
    settings.stabilizer,
    settings.strokeAssist
  );
  const setStabilizerStrength = (strength: number) => {
    onChange({
      stabilizer: strength,
      strokeAssist: {
        ...assist,
        preset: "custom",
        mode: "stabilizer",
        snapMode: "off",
        strength
      }
    });
  };
  return (
    <>
      <SettingGroup>
        <SketchModeToggle
          value={mode}
          onChange={(_, v) => {
            if (v) {
              onChange({ mode: v as EraserMode });
            }
          }}
        >
          <SketchModeOption
            value="brush"
            title="Erase with the current brush stamp (soft / hard / spray follow brush settings)."
          >
            Brush
          </SketchModeOption>
          <SketchModeOption
            value="pencil"
            title="Erase with crisp pencil dabs — follows the pencil tool's Pixel/Soft toggle."
          >
            Pencil
          </SketchModeOption>
        </SketchModeToggle>
      </SettingGroup>
      <SettingGroup>
        <Box className="setting-row setting-row--wide">
          <Text className="setting-label">Size</Text>
          <Slider
            sx={sketchSliderSx}
            size="small"
            min={1}
            max={200}
            value={settings.size}
            onChange={(_, v) => onChange({ size: v as number })}
          />
          <Text className="setting-value">{settings.size}</Text>
        </Box>
        <Box className="setting-row">
          <Text className="setting-label">Opacity</Text>
          <Slider
            sx={sketchSliderSx}
            size="small"
            min={0}
            max={1}
            step={0.01}
            value={settings.opacity}
            onChange={(_, v) => onChange({ opacity: v as number })}
          />
          <Text className="setting-value">
            {Math.round(settings.opacity * 100)}%
          </Text>
        </Box>
        <Box className="setting-row">
          <Text className="setting-label">Stabilize</Text>
          <Slider
            sx={sketchSliderSx}
            size="small"
            min={0}
            max={1}
            step={0.01}
            value={
              assist.mode === "stabilizer" ? assist.strength : settings.stabilizer ?? 0
            }
            onChange={(_, v) => setStabilizerStrength(v as number)}
          />
          <Text className="setting-value">
            {Math.round(
              (assist.mode === "stabilizer"
                ? assist.strength
                : settings.stabilizer ?? 0) * 100
            )}
            %
          </Text>
        </Box>
      </SettingGroup>
    </>
  );
});
