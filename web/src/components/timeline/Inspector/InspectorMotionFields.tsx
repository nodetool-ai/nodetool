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

import React, { memo, useCallback, useEffect, useState } from "react";
import type { ShapeFill } from "@nodetool-ai/timeline";

import { Caption, FlexColumn, SPACING, TextInput } from "../../ui_primitives";
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
    useEffect(() => {
      if (!focused) setDraft(value);
    }, [value, focused]);
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

export const EASING_HINT =
  "linear, easeIn, easeOut, easeInOut, easeOutBack, easeOutElastic, easeOutBounce, cubic-bezier(x1,y1,x2,y2) or spring(stiffness,damping,mass)";

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
  ({ value, ariaLabel, onChange, hint = true, label = "Easing" }) => {
    const handleCommit = useCallback(
      (raw: string) => {
        const trimmed = raw.trim();
        onChange(trimmed === "" ? undefined : trimmed);
      },
      [onChange]
    );
    return (
      <>
        <InspectorRow label={label}>
          <InspectorPillInput
            value={value ?? ""}
            placeholder="linear"
            minWidth={140}
            onCommit={handleCommit}
            ariaLabel={ariaLabel}
          />
        </InspectorRow>
        {hint && <Caption color="muted">{EASING_HINT}</Caption>}
      </>
    );
  }
);
EasingField.displayName = "EasingField";

const FILL_TYPE_OPTIONS = [
  { value: "none", label: "None" },
  { value: "solid", label: "Solid" },
  { value: "linear", label: "Linear gradient" },
  { value: "radial", label: "Radial gradient" }
] as const;

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
        <InspectorRow label="Fill">
          <InspectorSelect
            label={`${labelPrefix} type`}
            value={fill?.type ?? "none"}
            options={FILL_TYPE_OPTIONS}
            onChange={handleTypeChange}
          />
        </InspectorRow>
        {fill?.type === "solid" && (
          <InspectorRow label="Fill color">
            <TextInput
              type="color"
              value={fill.color}
              onChange={(event) =>
                onChange({ type: "solid", color: event.target.value })
              }
              inputProps={{ "aria-label": `${labelPrefix} color` }}
            />
          </InspectorRow>
        )}
        {fill?.type === "linear" && (
          <InspectorRow label="Angle">
            <InspectorPillInput
              value={String(fill.angle)}
              unit="°"
              onCommit={(raw) => {
                const angle = Number(raw);
                if (!Number.isFinite(angle)) return;
                onChange({ type: "linear", angle, stops: fill.stops });
              }}
              ariaLabel={`${labelPrefix} angle`}
            />
          </InspectorRow>
        )}
        {fill && fill.type !== "solid" && (
          <>
            <InspectorRow label="Stops">
              <TextCommitField
                value={formatGradientStops(fill.stops)}
                ariaLabel={`${labelPrefix} stops`}
                onCommit={handleStopsCommit}
              />
            </InspectorRow>
            <Caption color="muted">
              offset:color pairs, e.g. 0:#000000, 1:#ffffff
            </Caption>
          </>
        )}
      </FlexColumn>
    );
  }
);
FillFields.displayName = "FillFields";
