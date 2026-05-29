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
import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
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

import { DynamicInputButton } from "../../ui_primitives/DynamicInputButton";
import { NodeInputs } from "../../node/NodeInputs";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";

import type { NodeMetadata, Property } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { useBespokePropertyWriter } from "../../../hooks/nodes/useBespokePropertyWriter";
import { useDynamicProperty } from "../../../hooks/nodes/useDynamicProperty";
import { debounce } from "../../../utils/lodashAlternatives";

import { AssetMentionNode } from "./promptComposer/AssetMentionNode";
import { VariableNode, $createVariableNode } from "./promptComposer/VariableNode";
import AssetMentionPlugin from "./promptComposer/AssetMentionPlugin";
import AssetDropPlugin from "./promptComposer/AssetDropPlugin";
import {
  $serializePrompt,
  $setPromptFromString
} from "./promptComposer/promptEditorState";
import { PromptComposerContext } from "./promptComposer/promptComposerContext";

const PROMPT_NODE_TYPE = "nodetool.text.Prompt";

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
      borderRadius: "var(--rounded-sm, 4px)",
      border: `1px solid ${theme.vars.palette.divider}`,
      background: theme.vars.palette.background.default,
      padding: theme.spacing(0.75),
      overflow: "auto"
    },
    ".composer-input": {
      outline: "none",
      minHeight: 72,
      width: "100%",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      lineHeight: 1.5,
      color: theme.vars.palette.text.primary,
      "& p": { margin: 0 }
    },
    ".composer-placeholder": {
      position: "absolute",
      top: theme.spacing(0.75),
      left: theme.spacing(0.75),
      color: theme.vars.palette.text.disabled,
      fontFamily: theme.fontFamily2,
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
      padding: `${theme.spacing(0.25)} ${theme.spacing(0.75)}`,
      borderRadius: "var(--rounded-sm, 4px)",
      border: `1px solid ${theme.vars.palette.divider}`,
      background: "transparent",
      color: theme.vars.palette.text.primary,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      lineHeight: 1.4,
      "&:hover": { borderColor: theme.vars.palette.primary.main }
    },
    ".dynamic-inputs": { flex: "0 0 auto" },
    ".outputs-row": { flex: "0 0 auto" }
  });

const composerTheme = {
  paragraph: "composer-paragraph"
};

/** Quick-insert bar: one chip per dynamic input + the add-variable button. */
const VariableInsertBar: React.FC<{
  variableNames: string[];
  onAdd: () => void;
}> = ({ variableNames, onAdd }) => {
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
      <span className="variable-bar-label">Variables</span>
      {variableNames.map((name) => (
        <button
          key={name}
          type="button"
          className="variable-insert-chip nodrag"
          onClick={() => insertVariable(name)}
          aria-label={`Insert variable ${name}`}
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

  const { setProperties, setPropertyComplete } = useBespokePropertyWriter({
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

  const writePrompt = useMemo(
    () =>
      debounce((text: string) => {
        if (text === lastWrittenRef.current) {
          return;
        }
        lastWrittenRef.current = text;
        setProperties({ prompt: text });
        setPropertyComplete();
      }, 400),
    [setProperties, setPropertyComplete]
  );

  useEffect(() => {
    return () => {
      writePrompt.cancel();
    };
  }, [writePrompt]);

  const handleEditorChange = useCallback(
    (editorState: EditorState) => {
      editorState.read(() => {
        writePrompt($serializePrompt());
      });
    },
    [writePrompt]
  );

  const promptProperties = useMemo<Property[]>(() => [], []);

  return (
    <PromptComposerContext.Provider value={{ knownVariables }}>
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
            variableNames={variableNames}
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
