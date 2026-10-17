import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND
} from "lexical";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import FormatSizeIcon from "@mui/icons-material/FormatSize";
import HorizontalRuleIcon from "@mui/icons-material/HorizontalRule";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import {
  addClassNamesToElement,
  removeClassNamesFromElement
} from "@lexical/utils";
import { $patchStyleText } from "@lexical/selection";
import { FloatingToolbar, ToolbarIconButton } from "../ui_primitives";
import { isMac } from "../../utils/platform";
import { copyAsMarkdown } from "./exportMarkdown";
import { INSERT_HORIZONTAL_RULE_COMMAND } from "./horizontalRuleCommand";

const MOD_KEY = isMac() ? "⌘" : "Ctrl";

const ToolbarPlugin = () => {
  const [editor] = useLexicalComposerContext();
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isLargeFont, setIsLargeFont] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fontToggleTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
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

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }
      if (fontToggleTimeoutRef.current) {
        clearTimeout(fontToggleTimeoutRef.current);
      }
    };
  }, []);

  const toggleFontSize = useCallback(() => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const nodes = selection.getNodes();
        const hasAnyLargeFont = nodes.some((node) => {
          if (node.getType() === "text") {
            const dom = editor.getElementByKey(node.getKey());
            return dom?.getAttribute("data-large-font") === "true";
          }
          return false;
        });

        const shouldApplyLarge = !hasAnyLargeFont;

        // Use $patchStyleText with a marker property to trigger text node splitting
        // but don't use font-size since we want only CSS classes for styling
        $patchStyleText(selection, {
          "data-large-font-marker": shouldApplyLarge ? "true" : ""
        });

        if (fontToggleTimeoutRef.current) {
          clearTimeout(fontToggleTimeoutRef.current);
        }
        fontToggleTimeoutRef.current = setTimeout(() => {
          editor.getEditorState().read(() => {
            const newSelection = $getSelection();
            if ($isRangeSelection(newSelection)) {
              const nodes = newSelection.getNodes();
              nodes.forEach((node) => {
                if (node.getType() === "text") {
                  const dom = editor.getElementByKey(node.getKey());
                  if (dom) {
                    if (shouldApplyLarge) {
                      dom.removeAttribute("data-large-font-marker");
                      dom.setAttribute("data-large-font", "true");
                      addClassNamesToElement(dom, "font-size-large");

                      // Clean up empty style attribute if it exists
                      if (dom.getAttribute("style") === "") {
                        dom.removeAttribute("style");
                      }
                    } else {
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
  }, [editor]);

  const handleCopyAsMarkdown = useCallback(async () => {
    const success = await copyAsMarkdown(editor);
    if (success) {
      setCopied(true);
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }
      copiedTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    }
  }, [editor]);

  const handleInsertHR = useCallback(() => {
    editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined);
  }, [editor]);

  const handleFormatBold = useCallback(() => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
  }, [editor]);

  const handleFormatItalic = useCallback(() => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
  }, [editor]);

  return (
    <FloatingToolbar
      className="format-toolbar-actions"
      aria-label="Text formatting"
    >
      <ToolbarIconButton
        icon={<FormatBoldIcon />}
        tooltip="Bold"
        shortcut={[MOD_KEY, "B"]}
        ariaLabel="Format bold"
        active={isBold}
        aria-pressed={isBold}
        onClick={handleFormatBold}
      />
      <ToolbarIconButton
        icon={<FormatItalicIcon />}
        tooltip="Italic"
        shortcut={[MOD_KEY, "I"]}
        ariaLabel="Format italic"
        active={isItalic}
        aria-pressed={isItalic}
        onClick={handleFormatItalic}
      />
      <ToolbarIconButton
        icon={<FormatSizeIcon />}
        tooltip="Toggle large font size"
        ariaLabel="Toggle large font size"
        active={isLargeFont}
        aria-pressed={isLargeFont}
        onClick={toggleFontSize}
      />
      <ToolbarIconButton
        icon={<HorizontalRuleIcon />}
        tooltip="Insert horizontal rule"
        ariaLabel="Insert horizontal rule"
        onClick={handleInsertHR}
      />
      <ToolbarIconButton
        icon={<ContentCopyIcon />}
        tooltip="Copy as Markdown"
        ariaLabel="Copy as Markdown"
        active={copied}
        onClick={handleCopyAsMarkdown}
      />
    </FloatingToolbar>
  );
};

export default memo(ToolbarPlugin);
