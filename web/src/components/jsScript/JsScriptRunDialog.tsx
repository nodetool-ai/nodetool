/**
 * Prompts for one value per declared input before a run. Values are typed in
 * as JSON so a list or an object can be given as easily as a string; a value
 * that does not parse as JSON is passed through as the literal string, which
 * is what a user typing `hello` means.
 *
 * A body that reads its inputs with `stream` takes a whole stream per handle
 * rather than one value, so each field is then a JSON array of the items to
 * stage — the run pulls them one at a time, as it would from an upstream node.
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

/** What the dialog hands back: buffered values, or items staged per handle. */
export interface JsScriptRunRequest {
  inputs: Record<string, unknown>;
  inputStreams?: Record<string, unknown[]>;
}

export interface JsScriptRunDialogProps {
  open: boolean;
  inputs: readonly JsScriptPort[];
  /** True when the body reads its inputs with `stream`. */
  streaming?: boolean;
  onClose: () => void;
  onRun: (request: JsScriptRunRequest) => void;
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

/** The staged items for one handle: a JSON array, or one item as a single. */
export const parseStagedItems = (raw: string): unknown[] => {
  const trimmed = raw.trim();
  if (trimmed === "") return [];
  const value = parseInputValue(trimmed);
  return Array.isArray(value) ? value : [value];
};

const JsScriptRunDialog = ({
  open,
  inputs,
  streaming = false,
  onClose,
  onRun
}: JsScriptRunDialogProps) => {
  const [values, setValues] = useState<Record<string, string>>({});

  const request = useMemo<JsScriptRunRequest>(() => {
    if (streaming) {
      const staged: Record<string, unknown[]> = {};
      for (const port of inputs) {
        staged[port.name] = parseStagedItems(values[port.name] ?? "");
      }
      return { inputs: {}, inputStreams: staged };
    }
    const bag: Record<string, unknown> = {};
    for (const port of inputs) {
      bag[port.name] = parseInputValue(values[port.name] ?? "");
    }
    return { inputs: bag };
  }, [inputs, streaming, values]);

  const handleRun = useCallback(() => {
    onRun(request);
    onClose();
  }, [request, onClose, onRun]);

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
              {streaming
                ? "This script reads its inputs with stream(). Give each handle a JSON array of the items to stage, e.g. [1, 2, 3]."
                : "Values are read as JSON; anything that is not valid JSON is passed as text."}
            </Text>
            {inputs.map((port) => (
              <TextInput
                key={port.name}
                label={`${port.name} (${streaming ? `stream of ${port.type}` : port.type})`}
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
