/** @jsxImportSource @emotion/react */
import { useEffect, useState, useCallback } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  UNDO_COMMAND,
  REDO_COMMAND,
  CAN_UNDO_COMMAND,
  CAN_REDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  $getSelection,
  $isRangeSelection,
  TextNode
} from "lexical";
import { $createCodeNode, $isCodeNode, CodeNode } from "@lexical/code";
import { $setBlocksType } from "@lexical/selection";
import { sanitizeText } from "../../utils/sanitize";

interface EditorControllerProps {
  onCanUndoChange: (canUndo: boolean) => void;
  onCanRedoChange: (canRedo: boolean) => void;
  onTextChange: (text: string) => void;
  onUndoCommand: (fn: () => void) => void;
  onRedoCommand: (fn: () => void) => void;
  onFindCommand: (
    fn: (searchTerm: string) => { totalMatches: number; currentMatch: number }
  ) => void;
  onReplaceCommand: (
    fn: (searchTerm: string, replaceTerm: string, replaceAll?: boolean) => void
  ) => void;
  onNavigateCommand: (
    fn: (direction: "next" | "previous") => {
      currentMatch: number;
      totalMatches: number;
    }
  ) => void;
  onFormatCodeCommand: (fn: () => void) => void;
  onIsCodeBlockChange: (isCodeBlock: boolean) => void;
  initialContent?: string;
  wordWrapEnabled?: boolean;
}

const EditorController = ({
  onCanUndoChange,
  onCanRedoChange,
  onTextChange,
  onUndoCommand,
  onRedoCommand,
  onFindCommand,
  onReplaceCommand,
  onNavigateCommand,
  onFormatCodeCommand,
  onIsCodeBlockChange,
  initialContent,
  wordWrapEnabled = true
}: EditorControllerProps) => {
  const [editor] = useLexicalComposerContext();
  const [initialContentSet, setInitialContentSet] = useState(false);
  const [currentSearchTerm, setCurrentSearchTerm] = useState("");
  const [currentMatches, setCurrentMatches] = useState<number[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  // Highlight helpers using CSS Highlight API (focus-safe)
  const highlightAllName = "findMatches";
  const highlightCurrentName = "findCurrent";

  const clearHighlights = useCallback(() => {
    // Safely remove previous highlights if supported
    const hs = (CSS as any)?.highlights;
    hs?.delete?.(highlightAllName);
    hs?.delete?.(highlightCurrentName);
  }, [highlightAllName, highlightCurrentName]);

  // Given a single match offset, return a DOM Range corresponding to it.
  // This walker-based algorithm keeps an accurate global character counter that
  // mirrors the string returned by root.textContent(). The tricky part is that
  // the browser inserts an implicit "\n" between top-level block elements
  // (e.g. paragraphs, list items). Those newlines do NOT exist inside any real
  // text node, so we manually add one char to the counter whenever we move from
  // one top-level child to the next.
  const createRangeForMatch = useCallback(
    (matchStart: number, matchLength: number): Range | null => {
      const rootElement = editor.getRootElement();
      if (!rootElement) return null;

      const walker = document.createTreeWalker(
        rootElement,
        NodeFilter.SHOW_TEXT,
        null
      );

      let node: Node | null = null;
      let charCount = 0;

      // Helper to obtain the immediate child of rootElement that contains a
      // given node. Used to detect transitions between top-level blocks.
      const getTopLevelContainer = (n: Node | null): Node | null => {
        if (!n) return null;
        let current: Node | null = n;
        while (current && current.parentNode !== rootElement) {
          current = current.parentNode;
        }
        return current;
      };

      let prevTopLevel: Node | null = null;

      while ((node = walker.nextNode())) {
        // Insert implicit newline char when moving to a new top-level element
        const currentTopLevel = getTopLevelContainer(node);
        if (
          prevTopLevel &&
          currentTopLevel &&
          prevTopLevel !== currentTopLevel
        ) {
          // Account for the "\n" that root.textContent inserts between blocks
          if (matchStart === charCount) {
            // The match is exactly on the implicit newline -> there is no real
            // DOM position to highlight, so bail.
            return null;
          }
          charCount += 1;
        }
        prevTopLevel = currentTopLevel;

        const textLen = node.textContent?.length || 0;

        if (matchStart < charCount + textLen) {
          const range = document.createRange();
          const startOffset = matchStart - charCount;
          const endOffset = Math.min(startOffset + matchLength, textLen);
          range.setStart(node, startOffset);
          range.setEnd(node, endOffset);
          return range;
        }

        charCount += textLen;
      }

      return null;
    },
    [editor]
  );

  const applyHighlights = useCallback(
    (matchIndexes: number[], matchLength: number, currentIndex: number) => {
      clearHighlights();

      // CSS Highlight API supported?
      const hs = (CSS as any)?.highlights;
      if (hs && typeof hs.set === "function") {
        const ranges: Range[] = [];
        for (const start of matchIndexes) {
          const r = createRangeForMatch(start, matchLength);
          if (r) ranges.push(r);
        }
        if (ranges.length > 0) {
          // All matches group
          hs.set(highlightAllName, new (window as any).Highlight(...ranges));

          // Current match group (single range)
          const currentRange = ranges[currentIndex] || ranges[0];
          if (currentRange) {
            hs.set(
              highlightCurrentName,
              new (window as any).Highlight(currentRange)
            );
            // Scroll current into view
            currentRange.startContainer?.parentElement?.scrollIntoView({
              block: "center"
            });
          }
        }
      }
    },
    [
      clearHighlights,
      createRangeForMatch,
      highlightAllName,
      highlightCurrentName
    ]
  );

  const findMatches = useCallback(
    (text: string, searchTerm: string): number[] => {
      const matches: number[] = [];
      const lowerText = text.toLowerCase();
      const lowerSearchTerm = searchTerm.toLowerCase();
      let index = 0;

      while ((index = lowerText.indexOf(lowerSearchTerm, index)) !== -1) {
        matches.push(index);
        index += searchTerm.length;
      }

      return matches;
    },
    []
  );

  // Set up undo function
  const undoFn = useCallback(() => {
    editor.dispatchCommand(UNDO_COMMAND, undefined);
  }, [editor]);

  // Set up redo function
  const redoFn = useCallback(() => {
    editor.dispatchCommand(REDO_COMMAND, undefined);
  }, [editor]);

  // Set up format code block function
  const formatCodeBlockFn = useCallback(() => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const anchorNode = selection.anchor.getNode();
        const element =
          anchorNode.getKey() === "root"
            ? anchorNode
            : anchorNode.getTopLevelElementOrThrow();
        if ($isCodeNode(element)) {
          $setBlocksType(selection, () => $createParagraphNode());
        } else {
          // Create a code node with a default language
          $setBlocksType(selection, () => {
            const codeNode = $createCodeNode();
            if (codeNode instanceof CodeNode) {
              codeNode.setLanguage("javascript");
            }
            return codeNode;
          });
        }
      }
    });
  }, [editor]);

  /**
   * findFn: Handles the "Find" command.
   * Normalizes the input to a search string, searches the editor text (case-insensitive),
   * highlights all matches, updates internal state, and returns { totalMatches, currentMatch }.
   */
  const findFn = useCallback(
    (searchParam: any) => {
      let searchTerm = "";

      if (typeof searchParam === "string") {
        searchTerm = searchParam;
      } else if (searchParam && typeof searchParam === "object") {
        // event object
        if (
          "target" in searchParam &&
          searchParam.target &&
          "value" in searchParam.target
        ) {
          searchTerm = searchParam.target.value;
        }
        // React SyntheticEvent
        else if (
          "currentTarget" in searchParam &&
          searchParam.currentTarget &&
          "value" in searchParam.currentTarget
        ) {
          searchTerm = searchParam.currentTarget.value;
        }
        // has searchTerm property
        else if ("searchTerm" in searchParam) {
          searchTerm = searchParam.searchTerm;
        }
        // has a value property
        else if ("value" in searchParam) {
          searchTerm = searchParam.value;
        }
        // object but none of the above, try to convert to string
        else {
          searchTerm = "";
        }
      } else if (searchParam === null || searchParam === undefined) {
        searchTerm = "";
      } else {
        // Convert other types to string
        searchTerm = String(searchParam);
      }

      // searchTerm now contains the string to look for

      if (!searchTerm || searchTerm.trim() === "") {
        clearHighlights();
        setCurrentSearchTerm("");
        setCurrentMatches([]);
        setCurrentMatchIndex(0);
        return { totalMatches: 0, currentMatch: 0 };
      }

      // Get current editor content
      const editorState = editor.getEditorState();
      const text = editorState.read(() => $getRoot().getTextContent());

      const matches = findMatches(text, searchTerm);

      // Update local state
      setCurrentSearchTerm(searchTerm);
      setCurrentMatches(matches);
      setCurrentMatchIndex(matches.length > 0 ? 0 : -1);

      // Highlight all matches and scroll to the first one
      applyHighlights(matches, searchTerm.length, 0);

      return {
        totalMatches: matches.length,
        currentMatch: matches.length > 0 ? 1 : 0
      };
    },
    [editor, findMatches, applyHighlights, clearHighlights]
  );

  // Set up navigate function
  const navigateFn = useCallback(
    (direction: "next" | "previous") => {
      if (currentMatches.length === 0) {
        return { currentMatch: 0, totalMatches: 0 };
      }

      let newIndex = currentMatchIndex;

      if (direction === "next") {
        newIndex = currentMatchIndex + 1;
        if (newIndex >= currentMatches.length) newIndex = 0; // wrap
      } else {
        newIndex = currentMatchIndex - 1;
        if (newIndex < 0) newIndex = currentMatches.length - 1; // wrap
      }

      setCurrentMatchIndex(newIndex);

      // Re-apply highlights (positions may change if edits happened) and scroll to new current
      applyHighlights(currentMatches, currentSearchTerm.length, newIndex);

      return {
        totalMatches: currentMatches.length,
        currentMatch: newIndex + 1
      };
    },
    [currentSearchTerm, currentMatches, currentMatchIndex, applyHighlights]
  );

  // Set up replace function
  const replaceFn = useCallback(
    (searchTerm: any, replaceTerm: any, replaceAll?: boolean) => {
      // Normalise inputs to strings
      let searchStr = "";
      let replaceStr = "";

      try {
        searchStr =
          typeof searchTerm === "string"
            ? searchTerm
            : String(searchTerm || "");
        replaceStr =
          typeof replaceTerm === "string"
            ? replaceTerm
            : String(replaceTerm || "");
      } catch (error) {
        console.error("Error converting replace parameters to strings:", error);
        return;
      }

      if (!searchStr.trim()) {
        return;
      }

      // Case-insensitive search helper
      const lcSearch = searchStr.toLowerCase();

      let anyReplaced = false;

      // Perform replacement at the node level so we preserve existing node structure/formatting
      editor.update(() => {
        // Collect text nodes manually to avoid using deprecated $nodesOfType
        const textNodes: TextNode[] = [];
        const stack: any[] = [$getRoot()];

        while (stack.length > 0) {
          const node = stack.pop();
          if (!node) continue;

          if (node instanceof TextNode) {
            textNodes.push(node);
          }

          // Push children (if any) onto the stack
          if (typeof node.getChildren === "function") {
            const children = node.getChildren();
            if (Array.isArray(children)) {
              stack.push(...children);
            }
          }
        }

        for (const node of textNodes) {
          const text = node.getTextContent();
          const lcText = text.toLowerCase();

          if (!replaceAll) {
            const idx = lcText.indexOf(lcSearch);
            if (idx !== -1) {
              const safeReplaceStr = sanitizeText(replaceStr);
              const newText =
                text.slice(0, idx) +
                safeReplaceStr +
                text.slice(idx + searchStr.length);
              node.setTextContent(newText);
              anyReplaced = true;
              break; // Only replace first instance when replaceAll is false
            }
          } else {
            if (lcText.includes(lcSearch)) {
              // Global case-insensitive replacement within this node
              try {
                const escaped = searchStr.replace(
                  /[.*+?^${}()|[\]\\]/g,
                  "\\$&"
                );
                const safeReplaceStr = sanitizeText(replaceStr);
                const regex = new RegExp(escaped, "gi");
                const newText = text.replace(regex, safeReplaceStr);
                node.setTextContent(newText);
                anyReplaced = true;
              } catch (err) {
                console.error("Error performing regex replace:", err);
              }
            }
          }
        }
      });

      if (!anyReplaced) {
        return;
      }

      // After the editor.update finishes, read the new content and refresh UI-side state/highlights
      const newTextContent = editor
        .getEditorState()
        .read(() => $getRoot().getTextContent());

      // Trigger text change callback for external consumers
      onTextChange?.(newTextContent);

      // Refresh search highlights if a search is currently active
      if (currentSearchTerm) {
        const matches = findMatches(newTextContent, currentSearchTerm);
        setCurrentMatches(matches);
        setCurrentMatchIndex(matches.length > 0 ? 0 : -1);

        if (matches.length > 0) {
          applyHighlights(matches, currentSearchTerm.length, 0);
        } else {
          clearHighlights();
        }
      }
    },
    [
      editor,
      onTextChange,
      currentSearchTerm,
      findMatches,
      applyHighlights,
      clearHighlights
    ]
  );

  // Set initial content only once
  useEffect(() => {
    if (initialContent && initialContent.trim() && !initialContentSet) {
      setTimeout(() => {
        editor.update(() => {
          const root = $getRoot();
          const currentText = root.getTextContent();

          if (!currentText || currentText.trim() === "") {
            root.clear();
            const paragraph = $createParagraphNode();
            const textNode = $createTextNode(initialContent);
            paragraph.append(textNode);
            root.append(paragraph);
          }
        });
        setInitialContentSet(true);
      }, 0);
    }
  }, [editor, initialContent, initialContentSet]);

  // Register core editor functionality
  useEffect(() => {
    const removeCanUndoListener = editor.registerCommand<boolean>(
      CAN_UNDO_COMMAND,
      (payload) => {
        onCanUndoChange(payload);
        return false;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    const removeCanRedoListener = editor.registerCommand<boolean>(
      CAN_REDO_COMMAND,
      (payload) => {
        onCanRedoChange(payload);
        return false;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    const removeUpdateListener = editor.registerUpdateListener(
      ({ editorState }) => {
        editorState.read(() => {
          onTextChange($getRoot().getTextContent());

          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const anchorNode = selection.anchor.getNode();
            const element =
              anchorNode.getKey() === "root"
                ? anchorNode
                : anchorNode.getTopLevelElementOrThrow();
            onIsCodeBlockChange($isCodeNode(element));
          }
        });
      }
    );

    return () => {
      removeCanUndoListener();
      removeCanRedoListener();
      removeUpdateListener();
    };
  }, [
    editor,
    onCanUndoChange,
    onCanRedoChange,
    onTextChange,
    onIsCodeBlockChange
  ]);

  // Register command functions
  useEffect(() => {
    onUndoCommand(undoFn);
    onRedoCommand(redoFn);
    onFindCommand(findFn);
    onReplaceCommand(replaceFn);
    onNavigateCommand(navigateFn);
    onFormatCodeCommand(formatCodeBlockFn);
  }, [
    undoFn,
    redoFn,
    findFn,
    replaceFn,
    navigateFn,
    formatCodeBlockFn,
    onUndoCommand,
    onRedoCommand,
    onFindCommand,
    onReplaceCommand,
    onNavigateCommand,
    onFormatCodeCommand
  ]);

  // Handle search highlighting
  useEffect(() => {
    if (currentSearchTerm && currentMatches.length > 0) {
      applyHighlights(
        currentMatches,
        currentSearchTerm.length,
        currentMatchIndex
      );
    }
    return () => {
      clearHighlights();
    };
  }, [
    currentSearchTerm,
    currentMatches,
    currentMatchIndex,
    applyHighlights,
    clearHighlights
  ]);

  return null;
};

export default EditorController;
