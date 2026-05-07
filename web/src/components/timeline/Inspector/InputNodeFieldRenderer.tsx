/** @jsxImportSource @emotion/react */
/**
 * InputNodeFieldRenderer
 *
 * Chooses the appropriate primitive field component for each Input* node type.
 * Used by `NodePropertyEditor` to render editable controls for workflow
 * Input* nodes in the timeline inspector.
 *
 * Field mapping:
 *  - StringInput         → NodeTextField (multiline when node data has multiline:true)
 *  - IntegerInput        → NodeSlider (when min/max set) or NodeTextField
 *  - FloatInput          → NodeSlider (when min/max set) or NodeTextField
 *  - BooleanInput        → Checkbox
 *  - SelectInput         → NodeSelect + NodeMenuItem
 *  - ColorInput          → ColorPicker
 *  - ImageSizeInput      → Two number NodeTextFields (width / height)
 *  - LanguageModelInput  → LanguageModelSelect
 *  - ImageInput          → PropertyDropzone (image picker)
 *  - AudioInput          → PropertyDropzone (audio picker)
 *  - VideoInput          → PropertyDropzone (video picker)
 *  - all others          → NodeTextField (string fallback)
 */

import React, { useCallback, useEffect, useMemo, useState, memo } from "react";
import {
  Checkbox,
  FlexColumn,
  FlexRow,
  FormField,
  NodeMenuItem,
  NodeSelect,
  NodeSlider,
  NodeTextField
} from "../../ui_primitives";
import ColorPicker from "../../inputs/ColorPicker";
import LanguageModelSelect from "../../properties/LanguageModelSelect";
import type { LanguageModelValue } from "../../../stores/ApiTypes";

// ── Types ──────────────────────────────────────────────────────────────────

/** Minimal shape of a workflow graph node needed by this renderer. */
export interface InputGraphNode {
  id: string;
  type: string;
  /** Property values keyed by property name (name, value, min, max, etc.) */
  data?: Record<string, unknown>;
}

export interface InputNodeFieldRendererProps {
  /** The workflow Input* node to render a field for. */
  node: InputGraphNode;
  /**
   * Current value for this input, sourced from `clip.paramOverrides[paramName]`.
   * Falls back to `node.data.value` when absent.
   */
  value: unknown;
  /** Called when the user commits a new value. */
  onChange: (value: unknown) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function asNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asBoolean(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true" || v === "1";
  return fallback;
}

// ── Sub-field components ───────────────────────────────────────────────────

/** String or text area field with local draft state; commits on blur/Enter. */
const StringField: React.FC<{
  value: unknown;
  multiline?: boolean;
  label: string;
  onChange: (v: string) => void;
}> = ({ value, multiline, label, onChange }) => {
  const [draft, setDraft] = useState(asString(value));

  useEffect(() => {
    setDraft(asString(value));
  }, [value]);

  const commit = useCallback(() => {
    const current = asString(value);
    if (draft !== current) {
      onChange(draft);
    }
  }, [draft, value, onChange]);

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === "Enter" && !multiline) {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <FormField label={label}>
      <NodeTextField
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        multiline={multiline}
        minRows={multiline ? 3 : undefined}
      />
    </FormField>
  );
};

/** Numeric field with local draft state; commits on blur/Enter. */
const NumberField: React.FC<{
  value: unknown;
  label: string;
  step?: number;
  onChange: (v: number) => void;
}> = ({ value, label, step, onChange }) => {
  const [draft, setDraft] = useState(String(asNumber(value)));

  useEffect(() => {
    setDraft(String(asNumber(value)));
  }, [value]);

  const commit = useCallback(() => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) {
      onChange(parsed);
    }
  }, [draft, onChange]);

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <FormField label={label}>
      <NodeTextField
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        type="number"
        slotProps={{ htmlInput: { step: step ?? 1 } }}
      />
    </FormField>
  );
};

// ── ImageSize sub-renderer ─────────────────────────────────────────────────

type ImageSizeValue = { width: number; height: number };

const ImageSizeField: React.FC<{
  value: unknown;
  label: string;
  onChange: (v: ImageSizeValue) => void;
}> = ({ value, label, onChange }) => {
  const safeValue: ImageSizeValue = useMemo(
    () =>
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as ImageSizeValue)
        : { width: 1024, height: 1024 },
    [value]
  );

  const [wDraft, setWDraft] = useState(String(safeValue.width));
  const [hDraft, setHDraft] = useState(String(safeValue.height));

  useEffect(() => {
    setWDraft(String(safeValue.width));
    setHDraft(String(safeValue.height));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally sync on upstream `value` change

  const commitW = useCallback(() => {
    const w = Number(wDraft);
    if (Number.isFinite(w) && w > 0) {
      onChange({ ...safeValue, width: w });
    }
  }, [wDraft, safeValue, onChange]);

  const commitH = useCallback(() => {
    const h = Number(hDraft);
    if (Number.isFinite(h) && h > 0) {
      onChange({ ...safeValue, height: h });
    }
  }, [hDraft, safeValue, onChange]);

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <FormField label={label}>
      <FlexRow gap={1} align="center">
        <NodeTextField
          aria-label="Width"
          value={wDraft}
          onChange={(e) => setWDraft(e.target.value)}
          onBlur={commitW}
          onKeyDown={handleKeyDown}
          type="number"
          slotProps={{ htmlInput: { min: 1, step: 1 } }}
          sx={{ width: 80 }}
        />
        <span style={{ fontSize: "var(--fontSizeTiny)", opacity: 0.6 }}>×</span>
        <NodeTextField
          aria-label="Height"
          value={hDraft}
          onChange={(e) => setHDraft(e.target.value)}
          onBlur={commitH}
          onKeyDown={handleKeyDown}
          type="number"
          slotProps={{ htmlInput: { min: 1, step: 1 } }}
          sx={{ width: 80 }}
        />
      </FlexRow>
    </FormField>
  );
};

// ── LanguageModel sub-renderer ─────────────────────────────────────────────

const LanguageModelField: React.FC<{
  value: unknown;
  dataValue: unknown;
  label: string;
  onChange: (v: unknown) => void;
}> = ({ value, dataValue, label, onChange }) => {
  const lmVal =
    value !== null && typeof value === "object"
      ? (value as Record<string, unknown>)
      : dataValue !== null && typeof dataValue === "object"
        ? (dataValue as Record<string, unknown>)
        : {};
  const modelId = asString(lmVal.id);
  const handleModelChange = useCallback(
    (lm: LanguageModelValue) => {
      onChange(lm);
    },
    [onChange]
  );
  return (
    <FormField label={label}>
      <LanguageModelSelect value={modelId} onChange={handleModelChange} />
    </FormField>
  );
};

// ── Main renderer ──────────────────────────────────────────────────────────

const InputNodeFieldRendererInner: React.FC<InputNodeFieldRendererProps> = ({
  node,
  value,
  onChange
}) => {
  const data = node.data ?? {};
  const paramName = asString(data.name, node.id);
  const label = paramName;

  // ── BooleanInput ───────────────────────────────────────────────────────
  if (node.type === "nodetool.input.BooleanInput") {
    const checked = asBoolean(value, asBoolean(data.value));
    return (
      <FormField label={label}>
        <Checkbox
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          size="small"
          compact
        />
      </FormField>
    );
  }

  // ── SelectInput ────────────────────────────────────────────────────────
  if (node.type === "nodetool.input.SelectInput") {
    const options = Array.isArray(data.options) ? (data.options as string[]) : [];
    const current = asString(value, asString(data.value));
    return (
      <FormField label={label}>
        <NodeSelect
          value={current}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((opt) => (
            <NodeMenuItem key={opt} value={opt}>
              {opt}
            </NodeMenuItem>
          ))}
        </NodeSelect>
      </FormField>
    );
  }

  // ── IntegerInput ───────────────────────────────────────────────────────
  if (node.type === "nodetool.input.IntegerInput") {
    const min = data.min != null ? asNumber(data.min) : undefined;
    const max = data.max != null ? asNumber(data.max) : undefined;
    const numVal = asNumber(value, asNumber(data.value));
    if (min !== undefined && max !== undefined) {
      return (
        <FormField label={label}>
          <NodeSlider
            min={min}
            max={max}
            step={1}
            value={numVal}
            onChange={(_e, v) =>
              onChange(Array.isArray(v) ? Math.round(v[0]) : Math.round(v))
            }
          />
        </FormField>
      );
    }
    return (
      <NumberField
        label={label}
        value={value ?? data.value}
        step={1}
        onChange={(v) => onChange(Math.round(v))}
      />
    );
  }

  // ── FloatInput ─────────────────────────────────────────────────────────
  if (node.type === "nodetool.input.FloatInput") {
    const min = data.min != null ? asNumber(data.min) : undefined;
    const max = data.max != null ? asNumber(data.max) : undefined;
    const numVal = asNumber(value, asNumber(data.value));
    if (min !== undefined && max !== undefined) {
      return (
        <FormField label={label}>
          <NodeSlider
            min={min}
            max={max}
            step={(max - min) / 100}
            value={numVal}
            onChange={(_e, v) =>
              onChange(Array.isArray(v) ? v[0] : v)
            }
          />
        </FormField>
      );
    }
    return (
      <NumberField
        label={label}
        value={value ?? data.value}
        step={0.01}
        onChange={onChange}
      />
    );
  }

  // ── ColorInput ─────────────────────────────────────────────────────────
  if (node.type === "nodetool.input.ColorInput") {
    const colorObj =
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as { value?: string | null })
        : (data.value !== null && typeof data.value === "object"
            ? (data.value as { value?: string | null })
            : {});
    const colorStr = colorObj.value ?? null;
    return (
      <FormField label={label}>
        <ColorPicker
          color={colorStr}
          onColorChange={(newColor) => onChange({ type: "color", value: newColor })}
          showCustom
          isNodeProperty
        />
      </FormField>
    );
  }

  // ── ImageSizeInput ─────────────────────────────────────────────────────
  if (node.type === "nodetool.input.ImageSizeInput") {
    return (
      <ImageSizeField
        label={label}
        value={value ?? data.value}
        onChange={onChange}
      />
    );
  }

  // ── LanguageModelInput ─────────────────────────────────────────────────
  if (node.type === "nodetool.input.LanguageModelInput") {
    return (
      <LanguageModelField
        label={label}
        value={value}
        dataValue={data.value}
        onChange={onChange}
      />
    );
  }

  // ── StringInput (with optional multiline) ──────────────────────────────
  if (node.type === "nodetool.input.StringInput") {
    const multiline = Boolean(data.multiline);
    return (
      <StringField
        label={label}
        value={value ?? data.value}
        multiline={multiline}
        onChange={onChange}
      />
    );
  }

  // ── Fallback: plain text field ─────────────────────────────────────────
  return (
    <StringField
      label={label}
      value={
        typeof value === "string"
          ? value
          : value !== null && value !== undefined
            ? JSON.stringify(value)
            : asString(data.value)
      }
      onChange={onChange}
    />
  );
};

export const InputNodeFieldRenderer = memo(InputNodeFieldRendererInner);
InputNodeFieldRenderer.displayName = "InputNodeFieldRenderer";
