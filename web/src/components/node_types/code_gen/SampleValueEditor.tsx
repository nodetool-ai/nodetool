/**
 * Type-aware editor for one input's sample value.
 *
 * Scalars get a native control; everything else is edited as JSON, because a
 * sample is arbitrary data and a JSON field is the only editor that can hold
 * an image ref, a row list, or a nested record without losing shape.
 */
import { memo, useCallback, useMemo, useState } from "react";

import {
  Checkbox,
  Chip,
  FlexColumn,
  FlexRow,
  SPACING,
  TextInput,
  TextLink
} from "../../ui_primitives";
import { SAMPLE_SOURCE_LABEL, type SampleEntry } from "./codeGenSamples";

export interface SampleValueEditorProps {
  entry: SampleEntry;
  onChange: (name: string, value: unknown) => void;
  /** Offered when a hand edit is shadowing a latest-run value. */
  onRevert?: (name: string) => void;
  canRevert?: boolean;
  disabled?: boolean;
}

const NUMERIC = new Set(["int", "float", "number"]);
const TEXTUAL = new Set(["str", "text"]);

const SampleValueEditorInner = ({
  entry,
  onChange,
  onRevert,
  canRevert = false,
  disabled = false
}: SampleValueEditorProps) => {
  const { name, type, value, source } = entry;
  const isJson =
    !NUMERIC.has(type.type) && !TEXTUAL.has(type.type) && type.type !== "bool";

  const serialized = useMemo(
    () => JSON.stringify(value ?? null, null, 2),
    [value]
  );
  // Null while the field mirrors the value; a string once the user types, so
  // text that does not parse yet survives the keystroke.
  const [draft, setDraft] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const handleJsonChange = useCallback(
    (next: string) => {
      setDraft(next);
      try {
        onChange(name, JSON.parse(next) as unknown);
        setParseError(null);
      } catch {
        setParseError("Not valid JSON — the previous value is still used.");
      }
    },
    [name, onChange]
  );

  const handleRevert = useCallback(() => {
    setDraft(null);
    setParseError(null);
    onRevert?.(name);
  }, [name, onRevert]);

  const label = `${name}: ${type.type}`;

  return (
    <FlexColumn gap={SPACING.xs}>
      <FlexRow gap={SPACING.xs} align="center">
        <Chip compact label={SAMPLE_SOURCE_LABEL[source]} />
        {canRevert && onRevert && (
          <TextLink asButton onClick={handleRevert}>
            Use latest run
          </TextLink>
        )}
      </FlexRow>

      {type.type === "bool" ? (
        <Checkbox
          label={label}
          checked={value === true}
          disabled={disabled}
          onChange={(event) => onChange(name, event.target.checked)}
        />
      ) : NUMERIC.has(type.type) ? (
        <TextInput
          label={label}
          type="number"
          size="small"
          value={typeof value === "number" ? String(value) : ""}
          disabled={disabled}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            onChange(name, Number.isNaN(parsed) ? 0 : parsed);
          }}
        />
      ) : TEXTUAL.has(type.type) ? (
        <TextInput
          label={label}
          size="small"
          multiline
          rows={2}
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          onChange={(event) => onChange(name, event.target.value)}
        />
      ) : (
        <TextInput
          label={`${label} (JSON)`}
          size="small"
          multiline
          rows={3}
          value={draft ?? serialized}
          disabled={disabled}
          errorMessage={parseError ?? undefined}
          onChange={(event) => handleJsonChange(event.target.value)}
        />
      )}
    </FlexColumn>
  );
};

export const SampleValueEditor = memo(SampleValueEditorInner);
SampleValueEditor.displayName = "SampleValueEditor";

export default SampleValueEditor;
