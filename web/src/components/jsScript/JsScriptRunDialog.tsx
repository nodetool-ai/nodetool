/**
 * Prompts for one value per declared input before a run. Each port uses the
 * same typed property widget a mini-app InputNode uses, via
 * WorkflowInputControl. Types with no widget (`list`, `dict`, `any`) stay as
 * JSON text — a value that does not parse is passed as the literal string.
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
import { EditorUiProvider } from "../editor_ui";
import { NodeContext } from "../../contexts/NodeContext";
import { createNodeStore } from "../../stores/NodeStore";
import { WorkflowInputControl } from "../appbuilder/puck/WorkflowInputWidget";
import { isJsonScriptPortType } from "../appbuilder/inputKinds";
import {
  createPropertyForInput,
  resolveInputValue
} from "../appbuilder/inputProperty";
import { workflowInputForScriptPort } from "../appbuilder/workflowIO";
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

/** Empty store so integer/audio property widgets can call useNodes. */
let emptyStore: ReturnType<typeof createNodeStore> | null = null;
const getEmptyStore = () => {
  if (!emptyStore) {
    emptyStore = createNodeStore();
  }
  return emptyStore;
};

const usesJsonField = (port: JsScriptPort, streaming: boolean): boolean =>
  streaming || isJsonScriptPortType(port.type);

const fallbackForPort = (port: JsScriptPort): unknown => {
  const input = workflowInputForScriptPort(port);
  const property = createPropertyForInput(input);
  const resolved = resolveInputValue(input, property, undefined);
  if (resolved !== undefined) return resolved;
  if (input.kind === "integer" || input.kind === "float") return 0;
  return null;
};

const JsonPortField = ({
  port,
  streaming,
  value,
  onChange
}: {
  port: JsScriptPort;
  streaming: boolean;
  value: string;
  onChange: (raw: string) => void;
}) => (
  <TextInput
    label={`${port.name} (${streaming ? `stream of ${port.type}` : port.type})`}
    size="small"
    value={value}
    onChange={(event) => onChange(event.target.value)}
  />
);

const JsScriptRunDialog = ({
  open,
  inputs,
  streaming = false,
  onClose,
  onRun
}: JsScriptRunDialogProps) => {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [jsonDrafts, setJsonDrafts] = useState<Record<string, string>>({});

  const request = useMemo<JsScriptRunRequest>(() => {
    if (streaming) {
      const staged: Record<string, unknown[]> = {};
      for (const port of inputs) {
        staged[port.name] = parseStagedItems(jsonDrafts[port.name] ?? "");
      }
      return { inputs: {}, inputStreams: staged };
    }
    const bag: Record<string, unknown> = {};
    for (const port of inputs) {
      if (isJsonScriptPortType(port.type)) {
        bag[port.name] = parseInputValue(jsonDrafts[port.name] ?? "");
      } else if (values[port.name] !== undefined) {
        bag[port.name] = values[port.name];
      } else {
        bag[port.name] = fallbackForPort(port);
      }
    }
    return { inputs: bag };
  }, [inputs, streaming, values, jsonDrafts]);

  const handleRun = useCallback(() => {
    onRun(request);
    onClose();
  }, [request, onClose, onRun]);

  const store = useMemo(() => getEmptyStore(), []);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Run script"
      fullWidth
      maxWidth="sm"
      actions={
        <FlexRow gap={SPACING.md}>
          <EditorButton onClick={onClose}>Cancel</EditorButton>
          <EditorButton variant="contained" onClick={handleRun}>
            Run
          </EditorButton>
        </FlexRow>
      }
    >
      <NodeContext.Provider value={store}>
        <EditorUiProvider scope="inspector">
          {/* Phones are narrower than the 380px the controls want, so the
              floor only applies once there is room for it. */}
          <FlexColumn gap={SPACING.md} sx={{ minWidth: { xs: 0, sm: 380 } }}>
            {inputs.length === 0 ? (
              <Text size="small" color="secondary">
                This script declares no inputs. Run it as it is.
              </Text>
            ) : (
              <>
                <Text size="small" color="secondary">
                  {streaming
                    ? "This script reads its inputs with stream(). Give each handle a JSON array of the items to stage, e.g. [1, 2, 3]."
                    : "Each input uses the control for its declared type."}
                </Text>
                {inputs.map((port) =>
                  usesJsonField(port, streaming) ? (
                    <JsonPortField
                      key={port.name}
                      port={port}
                      streaming={streaming}
                      value={jsonDrafts[port.name] ?? ""}
                      onChange={(raw) =>
                        setJsonDrafts((current) => ({
                          ...current,
                          [port.name]: raw
                        }))
                      }
                    />
                  ) : (
                    <WorkflowInputControl
                      key={port.name}
                      input={workflowInputForScriptPort(port)}
                      value={
                        values[port.name] !== undefined
                          ? values[port.name]
                          : fallbackForPort(port)
                      }
                      onValue={(next) =>
                        setValues((current) => ({
                          ...current,
                          [port.name]: next
                        }))
                      }
                    />
                  )
                )}
              </>
            )}
          </FlexColumn>
        </EditorUiProvider>
      </NodeContext.Provider>
    </Dialog>
  );
};

export default memo(JsScriptRunDialog);
