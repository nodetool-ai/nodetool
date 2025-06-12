/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  LexicalEditor
} from "lexical";
import { memo, useCallback, useEffect, useState } from "react";

const toolbarStyles = css`
  display: flex;
  gap: 4px;
  background-color: rgba(255, 255, 255, 0.6);
  padding: 4px 8px;
  border-radius: 3px;
  button {
    padding: 1px 5px;
    min-width: 20px;
    font-size: 12px;
    border: none;
    line-height: 1.2em;
    background-color: transparent;
    border-radius: 3px;
    color: black;
    cursor: pointer;

    &.active {
      background-color: rgba(0, 0, 0, 0.1);
    }
    &:hover {
      background-color: rgba(0, 0, 0, 0.05);
    }
  }
`;

const ToolbarPlugin = () => {
  const [editor] = useLexicalComposerContext();
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      setIsBold(selection.hasFormat("bold"));
      setIsItalic(selection.hasFormat("italic"));
    }
  }, []);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        updateToolbar();
      });
    });
  }, [editor, updateToolbar]);

  return (
    <div css={toolbarStyles}>
      <button
        onClick={() => {
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
        }}
        className={isBold ? "active" : ""}
        aria-label="Format Bold"
        title="Bold (Ctrl+B)"
      >
        <b>B</b>
      </button>
      <button
        onClick={() => {
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
        }}
        className={isItalic ? "active" : ""}
        aria-label="Format Italic"
        title="Italic (Ctrl+I)"
      >
        <i>I</i>
      </button>
    </div>
  );
};

export default memo(ToolbarPlugin);
