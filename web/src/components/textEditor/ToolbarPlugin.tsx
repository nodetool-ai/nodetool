/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getSelection, $isRangeSelection, FORMAT_TEXT_COMMAND } from "lexical";
import { $patchStyleText } from "@lexical/selection";
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

const FONT_SIZE_LARGE = "1.25em";
const FONT_SIZE_NORMAL = "1em";

const ToolbarPlugin = () => {
  const [editor] = useLexicalComposerContext();
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isLargeFont, setIsLargeFont] = useState(false);

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      // Update text format
      setIsBold(selection.hasFormat("bold"));
      setIsItalic(selection.hasFormat("italic"));

      // Update font size by checking the style of the selection
      const style = selection.style;
      setIsLargeFont(style.includes(`font-size: ${FONT_SIZE_LARGE}`));
    }
  }, []);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        updateToolbar();
      });
    });
  }, [editor, updateToolbar]);

  const toggleFontSize = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const currentStyle = selection.style;
        const isCurrentlyLarge = currentStyle.includes(
          `font-size: ${FONT_SIZE_LARGE}`
        );
        $patchStyleText(selection, {
          "font-size": isCurrentlyLarge ? FONT_SIZE_NORMAL : FONT_SIZE_LARGE
        });
      }
    });
  };

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
      <button
        onClick={toggleFontSize}
        className={isLargeFont ? "active" : ""}
        aria-label="Toggle Large Font Size"
        title="Toggle Large Font Size"
      >
        A+
      </button>
    </div>
  );
};

export default memo(ToolbarPlugin);
