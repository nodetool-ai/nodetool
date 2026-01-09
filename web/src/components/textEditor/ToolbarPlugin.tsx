/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND
} from "lexical";
import { memo, useCallback, useEffect, useState } from "react";
import FormatSizeIcon from "@mui/icons-material/FormatSize";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import {
  addClassNamesToElement,
  removeClassNamesFromElement
} from "@lexical/utils";
import {
  $patchStyleText
} from "@lexical/selection";
import { copyAsMarkdown } from "./exportMarkdown";
import { INSERT_HORIZONTAL_RULE_COMMAND } from "./HorizontalRulePlugin";

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
  const [copied, setCopied] = useState(false);

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      // Text format
      setIsBold(selection.hasFormat("bold"));
      setIsItalic(selection.hasFormat("italic"));

      // Check for large font by examining the actual DOM elements
      const nodes = selection.getNodes();
      const hasLargeFont = nodes.some((node) => {
        if (node.getType() === "text") {
          const dom = editor.getElementByKey(node.getKey());
          return dom?.getAttribute("data-large-font") === "true";
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
        // Check current state by looking for existing data attribute
        const nodes = selection.getNodes();
        const hasAnyLargeFont = nodes.some((node) => {
          if (node.getType() === "text") {
            const dom = editor.getElementByKey(node.getKey());
            return dom?.getAttribute("data-large-font") === "true";
          }
          return false;
        });

        // Toggle based on current state
        const shouldApplyLarge = !hasAnyLargeFont;

        // Use $patchStyleText with a marker property to trigger text node splitting
        // but don't use font-size since we want only CSS classes for styling
        $patchStyleText(selection, {
          "data-large-font-marker": shouldApplyLarge ? "true" : ""
        });

        // Apply CSS classes and data attributes (without inline font-size)
        setTimeout(() => {
          editor.getEditorState().read(() => {
            const newSelection = $getSelection();
            if ($isRangeSelection(newSelection)) {
              const nodes = newSelection.getNodes();
              nodes.forEach((node) => {
                if (node.getType() === "text") {
                  const dom = editor.getElementByKey(node.getKey());
                  if (dom) {
                    if (shouldApplyLarge) {
                      // Remove the marker and add our actual data attribute and class
                      dom.removeAttribute("data-large-font-marker");
                      dom.setAttribute("data-large-font", "true");
                      addClassNamesToElement(dom, "font-size-large");

                      // Clean up empty style attribute if it exists
                      if (dom.getAttribute("style") === "") {
                        dom.removeAttribute("style");
                      }
                    } else {
                      // Clean up everything
                      dom.removeAttribute("data-large-font-marker");
                      dom.removeAttribute("data-large-font");
                      removeClassNamesFromElement(dom, "font-size-large");

                      // Clean up empty style attribute if it exists
                      if (dom.getAttribute("style") === "") {
                        dom.removeAttribute("style");
                      }
                    }
                  }
                }
              });
            }
          });
        }, 0);
      }
    });
  };

  const handleCopyAsMarkdown = async () => {
    const success = await copyAsMarkdown(editor);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleInsertHR = () => {
    editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined);
  };

  return (
    <div className="format-toolbar-actions" css={toolbarStyles}>
      <button
        onClick={() => {
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
        }}
        className={isBold ? "active" : ""}
        aria-label="Format Bold"
        title="Bold (Ctrl+B / ⌘+B)"
      >
        <b>B</b>
      </button>
      <button
        onClick={() => {
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
        }}
        className={isItalic ? "active" : ""}
        aria-label="Format Italic"
        title="Italic (Ctrl+I / ⌘+I)"
      >
        <i>I</i>
      </button>
      <button
        onClick={toggleFontSize}
        className={isLargeFont ? "active" : ""}
        aria-label="Toggle Large Font Size"
        title="Toggle Large Font Size"
      >
        <FormatSizeIcon sx={{ fontSize: "1em" }} />
      </button>
      <button
        onClick={handleInsertHR}
        aria-label="Insert Horizontal Rule"
        title="Insert Horizontal Rule"
        style={{ fontSize: "16px", fontWeight: "bold" }}
      >
        ─
      </button>
      <button
        onClick={handleCopyAsMarkdown}
        aria-label="Copy as Markdown"
        title="Copy as Markdown"
        className={copied ? "active" : ""}
      >
        <ContentCopyIcon sx={{ fontSize: "1em" }} />
      </button>
    </div>
  );
};

export default memo(ToolbarPlugin);
