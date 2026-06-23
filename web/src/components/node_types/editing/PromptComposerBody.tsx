/** @jsxImportSource @emotion/react */
/**
 * PromptComposerBody — bespoke body for `nodetool.text.Prompt`.
 *
 * A composer-style editor for the prompt string:
 *   - `@` opens an asset typeahead; picking an asset inserts a chip encoded
 *     as `asset://<id>.<ext>`. The runtime dereferences these to image/audio
 *     content before the prompt reaches a provider.
 *   - The node's dynamic inputs render as insertable `{{ variable }}` chips so
 *     references are visible at a glance; clicking one drops it at the caret.
 *
 * Chips are purely a visual aid — the node still stores a plain prompt string
 * (`asset://…`, `{{ name }}`), so existing `{{variable}}` substitution and the
 * backend asset dereferencing work whether or not a token is chipped.
 */
import React, {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState
} from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { $insertNodes, type EditorState } from "lexical";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import type { InitialConfigType } from "@lexical/react/LexicalComposer";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

import {
  DynamicInputButton,
  BORDER_RADIUS,
  MOTION,
  reducedMotion
} from "../../ui_primitives";
import { NodeInputs } from "../../node/NodeInputs";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";

import type { NodeMetadata, Property } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { useBespokePropertyWriter } from "../../../hooks/nodes/useBespokePropertyWriter";
import { useDynamicProperty } from "../../../hooks/nodes/useDynamicProperty";

import { AssetMentionNode } from "./promptComposer/AssetMentionNode";
import { VariableNode, $createVariableNode } from "./promptComposer/VariableNode";
import AssetMentionPlugin from "./promptComposer/AssetMentionPlugin";
import AssetDropPlugin from "./promptComposer/AssetDropPlugin";
import {
  $serializePrompt,
  $setPromptFromString
} from "./promptComposer/promptEditorState";
import { variablesInPrompt } from "./promptComposer/promptTokens";
import { PromptComposerContext } from "./promptComposer/promptComposerContext";
import { useGraphVariableNames } from "./useGraphVariables";
import { PROMPT_NODE_TYPE } from "../../../constants/nodeTypes";

const styles = (theme: Theme) =>
  css({
    "&.prompt-composer-body": {
      position: "relative",
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.5),
      padding: theme.spacing(0.5),
      minHeight: 0
    },
    ".composer-area": {
      position: "relative",
      flex: "1 1 auto",
      minHeight: 90,
      borderRadius: BORDER_RADIUS.sm,
      border: `1px solid ${theme.vars.palette.divider}`,
      // Blend into the node body by default; only recess into a higher-contrast
      // well (and accent the border) once the field is focused for editing.
      background: "transparent",
      padding: theme.spacing(1),
      overflow: "auto",
      transition: `${MOTION.background}, ${MOTION.border}`,
      ...reducedMotion({ transition: MOTION.none }),
      "&:focus-within": {
        background: theme.vars.palette.background.default,
        borderColor: theme.vars.palette.primary.main
      }
    },
    ".composer-input": {
      outline: "none",
      minHeight: 72,
      width: "100%",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmall,
      lineHeight: 1.5,
      color: theme.vars.palette.text.primary,
      "& p": { margin: 0 }
    },
    ".composer-placeholder": {
      position: "absolute",
      top: theme.spacing(1),
      left: theme.spacing(1),
      color: theme.vars.palette.text.disabled,
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmall,
      pointerEvents: "none"
    },
    ".variable-bar": {
      flex: "0 0 auto",
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      gap: theme.spacing(0.5)
    },
    ".variable-bar-label": {
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.04em"
    },
    ".variable-insert-chip": {
      cursor: "pointer",
      padding: `${theme.spacing(0.5)} ${theme.spacing(1)}`,
      borderRadius: BORDER_RADIUS.sm,
      border: `1px solid ${theme.vars.palette.divider}`,
      background: "transparent",
      color: theme.vars.palette.text.primary,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      lineHeight: 1.4,
      "&:hover": { borderColor: theme.vars.palette.primary.main }
    },
    // Variables defined by a Set Variable node: accent the border so they read
    // as "comes from elsewhere in the graph" rather than a local input.
    ".variable-insert-chip--graph": {
      borderColor: theme.vars.palette.info.main,
      color: theme.vars.palette.info.main
    },
    ".dynamic-inputs": { flex: "0 0 auto" },
    ".outputs-row": { flex: "0 0 auto" }
  });

const composerTheme = {
  paragraph: "composer-paragraph"
};

/** A variable offered in the insert bar, tagged by where it resolves from. */
interface InsertableVariable {
  name: string;
  /** "input" → the node's own dynamic input; "graph" → a Set Variable node. */
  source: "input" | "graph";
}

/**
 * Quick-insert bar: one chip per available variable (dynamic inputs first,
 * then variables defined by Set Variable nodes anywhere in the workflow) + the
 * add-variable button.
 */
const VariableInsertBar: React.FC<{
  variables: InsertableVariable[];
  showLabel: boolean;
  onAdd: () => void;
}> = ({ variables, showLabel, onAdd }) => {
  const [editor] = useLexicalComposerContext();
  const insertVariable = useCallback(
    (name: string) => {
      editor.update(() => {
        $insertNodes([$createVariableNode(name)]);
      });
    },
    [editor]
  );
  return (
    <div className="variable-bar">
      {showLabel && <span className="variable-bar-label">Variables</span>}
      {variables.map(({ name, source }) => (
        <button
          key={name}
          type="button"
          className={`variable-insert-chip nodrag${
            source === "graph" ? " variable-insert-chip--graph" : ""
          }`}
          onClick={() => insertVariable(name)}
          aria-label={
            source === "graph"
              ? `Insert variable ${name} set by a Set Variable node`
              : `Insert variable ${name}`
          }
          title={
            source === "graph"
              ? `Set by a Set Variable node`
              : undefined
          }
        >
          {`{{ ${name} }}`}
        </button>
      ))}
      <DynamicInputButton itemLabel="variable" onAdd={onAdd} />
    </div>
  );
};

export interface PromptComposerBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const PromptComposerBodyInner: React.FC<PromptComposerBodyProps> = ({
  id,
  nodeType,
  nodeMetadata,
  data,
  workflowId,
  status,
  isOutputNode
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  const { setProperties } = useBespokePropertyWriter({
    nodeId: id,
    nodeType
  });

  const dynamicProperties = useMemo(
    () => (data.dynamic_properties ?? {}) as Record<string, unknown>,
    [data.dynamic_properties]
  );
  const variableNames = useMemo(
    () => Object.keys(dynamicProperties),
    [dynamicProperties]
  );
  const knownVariables = useMemo(
    () => new Set(variableNames),
    [variableNames]
  );

  // Variables defined by Set Variable nodes anywhere in the workflow. They
  // resolve at runtime from the shared processing context, so they're offered
  // as insertable chips and treated as "known" even without a dynamic input.
  const graphVariableNames = useGraphVariableNames();
  const graphVariables = useMemo(
    () => new Set(graphVariableNames),
    [graphVariableNames]
  );
  const promptComposerContextValue = useMemo(
    () => ({ knownVariables, graphVariables }),
    [knownVariables, graphVariables]
  );

  // Insert-bar entries: the node's own inputs first, then variables defined by
  // Set Variable nodes that aren't already covered by an input of the same name.
  const insertableVariables = useMemo(
    () => [
      ...variableNames.map(
        (name) => ({ name, source: "input" as const })
      ),
      ...graphVariableNames
        .filter((name) => !knownVariables.has(name))
        .map((name) => ({ name, source: "graph" as const }))
    ],
    [variableNames, graphVariableNames, knownVariables]
  );

  const { handleAddProperty, handleDeleteProperty, handleUpdatePropertyName } =
    useDynamicProperty(id, dynamicProperties);

  const handleAddVariable = useCallback(() => {
    let i = 1;
    while (`var_${i}` in dynamicProperties) {
      i += 1;
    }
    handleAddProperty(`var_${i}`);
  }, [dynamicProperties, handleAddProperty]);

  // Capture the initial prompt once — the editor owns the value after mount.
  const initialPromptRef = useRef<string>(
    typeof data.properties?.prompt === "string"
      ? (data.properties.prompt as string)
      : ""
  );
  const lastWrittenRef = useRef<string>(initialPromptRef.current);

  // Live prompt text, mirrored from the editor on every change so the
  // "Variables" label can track whether the prompt actually references one.
  const [promptText, setPromptText] = useState<string>(
    initialPromptRef.current
  );
  const promptReferencesVariable = useMemo(
    () => variablesInPrompt(promptText).length > 0,
    [promptText]
  );

  const initialConfig = useMemo<InitialConfigType>(
    () => ({
      namespace: "PromptComposer",
      nodes: [AssetMentionNode, VariableNode],
      theme: composerTheme,
      editorState: () => {
        $setPromptFromString(initialPromptRef.current);
      },
      onError: (error: Error) => {
        console.error(error);
      }
    }),
    []
  );

  // Commit the serialized prompt to the store on every edit. Writing
  // synchronously — rather than behind a debounce — guarantees a run (manual or
  // auto) always reads the current text. A debounced write let a run fired
  // within the debounce window send the node's *previous* prompt downstream,
  // producing the intermittent stale-value bug. The equality guard skips
  // redundant writes from selection-only editor changes (Lexical's
  // OnChangePlugin fires for those too); auto-run is still coalesced downstream
  // by useNodeAutoRun's own debounce.
  const commitPrompt = useCallback(
    (text: string) => {
      if (text === lastWrittenRef.current) {
        return;
      }
      lastWrittenRef.current = text;
      setProperties({ prompt: text });
    },
    [setProperties]
  );

  const handleEditorChange = useCallback(
    (editorState: EditorState) => {
      editorState.read(() => {
        const serialized = $serializePrompt();
        setPromptText(serialized);
        commitPrompt(serialized);
      });
    },
    [commitPrompt]
  );

  const promptProperties = useMemo<Property[]>(() => [], []);

  return (
    <PromptComposerContext.Provider value={promptComposerContextValue}>
      <div css={cssStyles} className="prompt-composer-body node-drag-handle">
        <LexicalComposer initialConfig={initialConfig}>
          <div className="composer-area nodrag nowheel">
            <PlainTextPlugin
              contentEditable={
                <ContentEditable
                  className="composer-input"
                  aria-label="Prompt"
                  spellCheck={false}
                  onClick={(e) => e.stopPropagation()}
                />
              }
              placeholder={
                <div className="composer-placeholder">
                  Write a prompt… @ to mention an asset
                </div>
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
            <HistoryPlugin />
            <OnChangePlugin onChange={handleEditorChange} />
            <AssetMentionPlugin />
            <AssetDropPlugin />
          </div>

          <VariableInsertBar
            variables={insertableVariables}
            showLabel={promptReferencesVariable}
            onAdd={handleAddVariable}
          />
        </LexicalComposer>

        {variableNames.length > 0 && (
          <div className="dynamic-inputs">
            <NodeInputs
              id={id}
              nodeType={nodeType}
              nodeMetadata={nodeMetadata}
              layout={nodeMetadata.layout}
              properties={promptProperties}
              data={data}
              showFields={true}
              editableDynamicInputs={true}
              onDeleteProperty={handleDeleteProperty}
              onUpdatePropertyName={handleUpdatePropertyName}
            />
          </div>
        )}

        {!isOutputNode && (
          <div className="outputs-row">
            <NodeOutputs id={id} outputs={nodeMetadata.outputs} />
          </div>
        )}

        {status === "running" && (
          <NodeProgress id={id} workflowId={workflowId} />
        )}
      </div>
    </PromptComposerContext.Provider>
  );
};

export const PromptComposerBody = memo(PromptComposerBodyInner);
PromptComposerBody.displayName = "PromptComposerBody";

export { PROMPT_NODE_TYPE };
export default PromptComposerBody;
