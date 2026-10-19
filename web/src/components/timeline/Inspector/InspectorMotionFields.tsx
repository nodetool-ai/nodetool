/**
 * Controls shared by more than one motion-graphics inspector section.
 *
 * `easing` is a string in the document (I2, D3): the seven named ids plus the
 * `cubic-bezier(...)` / `spring(...)` grammar. A select cannot offer an
 * infinite set, so every easing control is a free-text field that states the
 * grammar underneath it, and an unparseable value eases linearly rather than
 * failing the document.
 *
 * `ShapeFill` is the other shared shape: a text clip's gradient fill and a
 * shape clip's are the same union, so they get one editor.
 */

import React, { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { parseEasing, type ShapeFill } from "@nodetool-ai/timeline";

import { Caption, FlexColumn, SPACING, TextInput, BatchedColorInput } from "../../ui_primitives";
import {
  InspectorPillInput,
  InspectorRow,
  InspectorSelect
} from "./InspectorPrimitives";
import {
  formatGradientStops,
  parseGradientStops
} from "./InspectorPrimitives.helpers";

interface TextCommitFieldProps {
  value: string;
  ariaLabel: string;
  placeholder?: string;
  /** Called on blur and on Enter, never per keystroke. */
  onCommit: (raw: string) => void;
}

/**
 * A full-width text field that writes to the store on blur, not on every
 * keystroke — the list-valued fields (gradient stops, dash pattern, SVG path,
 * curve points) are only parseable once the user has finished typing them.
 */
export const TextCommitField: React.FC<TextCommitFieldProps> = memo(
  ({ value, ariaLabel, placeholder, onCommit }) => {
    const [draft, setDraft] = useState(value);
    const [focused, setFocused] = useState(false);
    // The draft follows the store while the field is not being typed in,
    // compared during render rather than in an effect — an effect would paint
    // one frame of the stale draft after every undo and every agent edit.
    const [syncedValue, setSyncedValue] = useState(value);
    if (!focused && value !== syncedValue) {
      setSyncedValue(value);
      setDraft(value);
    }
    return (
      <TextInput
        value={draft}
        fullWidth
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if (draft !== value) onCommit(draft);
          // Show what the store kept: a rejected draft must not stay on screen.
          setDraft(value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            (event.target as HTMLInputElement).blur();
          }
        }}
        inputProps={{ "aria-label": ariaLabel }}
      />
    );
  }
);
TextCommitField.displayName = "TextCommitField";

/**
 * Shown under an easing field whose value `parseEasing` cannot compile. The
 * document keeps the string — a newer build may read it (I2) — and this build
 * eases linearly, so the caption says that rather than refusing the edit.
 */
export const EASING_HINT =
  "linear, easeIn, easeOut, easeInOut, easeOutBack, easeOutElastic, easeOutBounce, cubic-bezier(x1,y1,x2,y2), spring(stiffness,damping,mass)";

/** The four edges a wipe, push or slide can travel from. */
export const DIRECTION_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "up", label: "Up" },
  { value: "down", label: "Down" }
] as const;

interface EasingFieldProps {
  value: string | undefined;
  /** Accessible name — each easing field on a panel needs its own. */
  ariaLabel: string;
  onChange: (next: string | undefined) => void;
  /** Render the grammar hint under the field. Off inside dense repeats. */
  hint?: boolean;
  label?: string;
}

export const EasingField: React.FC<EasingFieldProps> = memo(
  ({ value, ariaLabel, onChange, hint = true, label }) => {
    const { t } = useTranslation();
    const fieldLabel = label ?? t("i18n-cont-inspector-02.motion.easing");
    const handleCommit = useCallback(
      (raw: string) => {
        const trimmed = raw.trim();
        onChange(trimmed === "" ? undefined : trimmed);
      },
      [onChange]
    );
    // Computed during render, so a value typed here and one an agent wrote
    // into the document are reported the same way.
    const unparseable =
      value !== undefined && value !== "" && parseEasing(value) === null;
    return (
      <>
        <InspectorRow label={fieldLabel}>
          <InspectorPillInput
            value={value ?? ""}
            placeholder={t("i18n-cont-inspector-02.motion.linearPlaceholder")}
            allowEmpty
            minWidth={140}
            onCommit={handleCommit}
            ariaLabel={ariaLabel}
          />
        </InspectorRow>
        {unparseable && (
          <Caption color="muted">{t("i18n-cont-inspector-02.motion.unparseableEasing")}</Caption>
        )}
        {hint && <Caption color="muted">{t("i18n-cont-inspector-02.motion.easingHint")}</Caption>}
      </>
    );
  }
);
EasingField.displayName = "EasingField";

const FILL_TYPE_VALUES = ["none", "solid", "linear", "radial"] as const;

// A new gradient's black-to-white ramp, drawn into the picture rather than the
// editor's chrome, so these are document values and not palette tokens.
/* eslint-disable design-tokens/color-tokens */
const DEFAULT_STOPS = [
  { offset: 0, color: "#000000" },
  { offset: 1, color: "#ffffff" }
];
/* eslint-enable design-tokens/color-tokens */

interface FillFieldsProps {
  fill: ShapeFill | undefined;
  /** Prefixes every accessible name, e.g. "Text fill" → "Text fill type". */
  labelPrefix: string;
  onChange: (next: ShapeFill | undefined) => void;
}

/** Fill-type select plus the fields that type carries. */
export const FillFields: React.FC<FillFieldsProps> = memo(
  ({ fill, labelPrefix, onChange }) => {
    const { t } = useTranslation();
    const fillTypeOptions = FILL_TYPE_VALUES.map((value) => ({
      value,
      label: t(`i18n-cont-inspector-02.motion.fillTypes.${value}`)
    }));
    const handleTypeChange = useCallback(
      (value: string) => {
        if (value === "none") {
          onChange(undefined);
          return;
        }
        if (value === "solid") {
          onChange({
            type: "solid",
            color: fill?.type === "solid" ? fill.color : "#ffffff"
          });
          return;
        }
        const stops = fill && fill.type !== "solid" ? fill.stops : DEFAULT_STOPS;
        onChange(
          value === "linear"
            ? {
                type: "linear",
                angle: fill?.type === "linear" ? fill.angle : 0,
                stops
              }
            : { type: "radial", stops }
        );
      },
      [fill, onChange]
    );

    const handleStopsCommit = useCallback(
      (raw: string) => {
        if (!fill || fill.type === "solid") return;
        const stops = parseGradientStops(raw);
        if (stops === null || stops.length === 0) return;
        onChange(
          fill.type === "linear"
            ? { type: "linear", angle: fill.angle, stops }
            : { type: "radial", stops }
        );
      },
      [fill, onChange]
    );

    return (
      <FlexColumn gap={SPACING.xs}>
        <InspectorRow label={t("i18n-cont-inspector-02.motion.fill")}>
          <InspectorSelect
            label={t("i18n-cont-inspector-02.motion.fillTypeLabel", { prefix: labelPrefix })}
            value={fill?.type ?? "none"}
            options={fillTypeOptions}
            onChange={handleTypeChange}
          />
        </InspectorRow>
        {fill?.type === "solid" && (
          <InspectorRow label={t("i18n-cont-inspector-02.motion.fillColor")}>
            <BatchedColorInput
              value={fill.color}
              onChange={(color) => onChange({ type: "solid", color })}
              ariaLabel={t("i18n-cont-inspector-02.motion.fillColorLabel", { prefix: labelPrefix })}
            />
          </InspectorRow>
        )}
        {fill?.type === "linear" && (
          <InspectorRow label={t("i18n-cont-inspector-02.motion.angle")}>
            <InspectorPillInput
              value={String(fill.angle)}
              unit="°"
              onCommit={(raw) => {
                const angle = Number(raw);
                if (!Number.isFinite(angle)) return;
                onChange({ type: "linear", angle, stops: fill.stops });
              }}
              ariaLabel={t("i18n-cont-inspector-02.motion.angleLabel", { prefix: labelPrefix })}
            />
          </InspectorRow>
        )}
        {fill && fill.type !== "solid" && (
          <>
            <InspectorRow label={t("i18n-cont-inspector-02.motion.stops")}>
              <TextCommitField
                value={formatGradientStops(fill.stops)}
                ariaLabel={t("i18n-cont-inspector-02.motion.stopsLabel", { prefix: labelPrefix })}
                onCommit={handleStopsCommit}
              />
            </InspectorRow>
            <Caption color="muted">
              {t("i18n-cont-inspector-02.motion.gradientStopsHint")}
            </Caption>
          </>
        )}
      </FlexColumn>
    );
  }
);
FillFields.displayName = "FillFields";
