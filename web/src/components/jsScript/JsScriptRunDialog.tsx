/**
 * Prompts for one value per declared input before a run. Values are typed in
 * as JSON so a list or an object can be given as easily as a string; a value
 * that does not parse as JSON is passed through as the literal string, which
 * is what a user typing `hello` means.
 */
import { memo, useCallback, useMemo, useState } from "react";

import {
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  Text,
  TextInput,
  SPACING
} from "../ui_primitives";
import type { JsScriptPort } from "../../stores/jsScript/JsScriptStore";

export interface JsScriptRunDialogProps {
  open: boolean;
  inputs: readonly JsScriptPort[];
  onClose: () => void;
  onRun: (inputs: Record<string, unknown>) => void;
}

/** JSON when it parses, the raw string otherwise. An empty field is `null`. */
export const parseInputValue = (raw: string): unknown => {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return raw;
  }
};

const JsScriptRunDialog = ({
  open,
  inputs,
  onClose,
  onRun
}: JsScriptRunDialogProps) => {
  const [values, setValues] = useState<Record<string, string>>({});

  const bag = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const port of inputs) {
      out[port.name] = parseInputValue(values[port.name] ?? "");
    }
    return out;
  }, [inputs, values]);

  const handleRun = useCallback(() => {
    onRun(bag);
    onClose();
  }, [bag, onClose, onRun]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Run script"
      actions={
        <FlexRow gap={SPACING.md}>
          <EditorButton onClick={onClose}>Cancel</EditorButton>
          <EditorButton variant="contained" onClick={handleRun}>
            Run
          </EditorButton>
        </FlexRow>
      }
    >
      <FlexColumn gap={SPACING.md} sx={{ minWidth: 380 }}>
        {inputs.length === 0 ? (
          <Text size="small" color="secondary">
            This script declares no inputs. Run it as it is.
          </Text>
        ) : (
          <>
            <Text size="small" color="secondary">
              Values are read as JSON; anything that is not valid JSON is passed
              as text.
            </Text>
            {inputs.map((port) => (
              <TextInput
                key={port.name}
                label={`${port.name} (${port.type})`}
                size="small"
                value={values[port.name] ?? ""}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [port.name]: event.target.value
                  }))
                }
              />
            ))}
          </>
        )}
      </FlexColumn>
    </Dialog>
  );
};

export default memo(JsScriptRunDialog);
