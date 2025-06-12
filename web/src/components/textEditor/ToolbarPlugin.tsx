/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  $isTextNode
} from "lexical";
import { memo, useCallback, useEffect, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import {
  addClassNamesToElement,
  removeClassNamesFromElement
} from "@lexical/utils";

const toolbarStyles = css`
  display: flex;
  gap: 4px;
  background-color: rgba(240, 240, 240, 0.5);
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
  const [isLargeFont, setIsLargeFont] = useState(false);

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      // Text format
      setIsBold(selection.hasFormat("bold"));
      setIsItalic(selection.hasFormat("italic"));

      // Check if any selected nodes have the font-size-large class
      const nodes = selection.getNodes();
      const hasLargeFont = nodes.some((node) => {
        if ($isTextNode(node)) {
          const dom = editor.getElementByKey(node.getKey());
          return dom?.classList.contains("font-size-large");
        }
        return false;
      });
      setIsLargeFont(hasLargeFont);
    }
  }, [editor]);

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
        const nodes = selection.getNodes();

        nodes.forEach((node) => {
          if ($isTextNode(node)) {
            const dom = editor.getElementByKey(node.getKey());

            if (dom) {
              if (dom.classList.contains("font-size-large")) {
                removeClassNamesFromElement(dom, "font-size-large");
              } else {
                addClassNamesToElement(dom, "font-size-large");
              }
            }
          }
        });
      }
    });
  };

  return (
    <div className="format-toolbar-actions" css={toolbarStyles}>
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
        <AddIcon sx={{ fontSize: "1em" }} />
      </button>
    </div>
  );
};

export default memo(ToolbarPlugin);
