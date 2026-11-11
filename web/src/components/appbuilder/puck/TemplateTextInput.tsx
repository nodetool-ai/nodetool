import { useEffect, useRef } from "react";
import {
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  SPACING,
  TemplateTextArea,
  TextInput
} from "../../ui_primitives";
import PromptCameraPresets from "./PromptCameraPresets";

interface TemplateTextInputProps {
  id: string;
  label?: string;
  placeholder?: string;
  hint?: string;
  multiline?: boolean;
  disabled?: boolean;
  highlightPlaceholders?: boolean;
  cameraPresets?: boolean;
  value: string;
  fields: readonly string[];
  onChange: (value: string) => void;
  onCommit: () => void;
}

const TemplateTextInput = (props: TemplateTextInputProps) => {
  const Input =
    props.highlightPlaceholders && props.multiline
      ? TemplateTextArea
      : TextInput;
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const pendingCursor = useRef<number | null>(null);

  useEffect(() => {
    if (pendingCursor.current !== null) {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(
        pendingCursor.current,
        pendingCursor.current
      );
      pendingCursor.current = null;
    }
  }, [props.value]);

  const insertText = (text: string, separate = false) => {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    const start = input.selectionStart ?? props.value.length;
    const end = input.selectionEnd ?? start;
    const before = props.value.slice(0, start);
    const after = props.value.slice(end);
    const token = separate
      ? `${before && !/\s$/.test(before) ? " " : ""}${text}${after && !/^[\s.,!?;:]/.test(after) ? " " : ""}`
      : text;
    const cursor = start + token.length;
    const next = before + token + after;
    pendingCursor.current = next === props.value ? null : cursor;
    props.onChange(next);
    input.focus();
    input.setSelectionRange(cursor, cursor);
    props.onCommit();
  };

  return (
    <FlexColumn gap={SPACING.sm} fullWidth>
      <Input
        inputRef={inputRef}
        data-focus-id={`app-widget-${props.id}`}
        label={props.label ?? ""}
        placeholder={props.placeholder ?? ""}
        helperText={props.hint || undefined}
        slotProps={{ formHelperText: { sx: { mx: 0 } } }}
        value={props.value}
        multiline={Boolean(props.multiline)}
        minRows={props.multiline ? 3 : undefined}
        disabled={props.disabled}
        size="small"
        fullWidth
        onChange={(event) => props.onChange(event.target.value)}
        onBlur={props.onCommit}
      />
      {props.fields.length > 0 && (
        <>
          <Caption>Insert a field</Caption>
          <FlexRow gap={SPACING.sm} wrap>
            {props.fields.map((field) => (
              <EditorButton
                key={field}
                size="small"
                variant="outlined"
                disabled={props.disabled}
                aria-label={`Insert {{${field}}}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertText(`{{${field}}}`)}
              >
                {`{{${field}}}`}
              </EditorButton>
            ))}
          </FlexRow>
        </>
      )}
      {props.cameraPresets && (
        <FlexRow>
          <PromptCameraPresets
            disabled={props.disabled}
            onInsert={(text) => insertText(text, true)}
          />
        </FlexRow>
      )}
    </FlexColumn>
  );
};

export default TemplateTextInput;
