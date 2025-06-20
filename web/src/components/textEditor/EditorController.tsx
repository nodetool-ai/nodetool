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
  $isRangeSelection
} from "lexical";
import { $createCodeNode, $isCodeNode, CodeNode } from "@lexical/code";
import { $setBlocksType } from "@lexical/selection";

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
  initialContent
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

  // Given a single match offset, return a DOM Range corresponding to it
  const createRangeForMatch = useCallback(
    (matchStart: number, matchLength: number): Range | null => {
      const rootElement = editor.getRootElement();
      if (!rootElement) return null;

      const paragraphs = Array.from(rootElement.children);
      let charCount = 0;

      for (let i = 0; i < paragraphs.length; i++) {
        const para = paragraphs[i] as HTMLElement;
        const paraTextLength = para.textContent?.length || 0;

        if (matchStart < charCount + paraTextLength) {
          const offsetWithinPara = matchStart - charCount;

          const walker = document.createTreeWalker(
            para,
            NodeFilter.SHOW_TEXT,
            null
          );
          let node: Node | null = null;
          let nodeCharCount = 0;

          while ((node = walker.nextNode())) {
            const textLen = node.textContent?.length || 0;
            if (offsetWithinPara < nodeCharCount + textLen) {
              const range = document.createRange();
              const startOffset = offsetWithinPara - nodeCharCount;
              const endOffset = startOffset + matchLength;
              range.setStart(node, startOffset);
              range.setEnd(node, endOffset);
              return range;
            }
            nodeCharCount += textLen;
          }
          return null;
        }
        charCount += paraTextLength + 1; // newline char between paragraphs
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

  // Set up find function
  const findFn = useCallback(
    (searchParam: any) => {
      // Normalise the incoming parameter
      let searchTerm = "";

      if (typeof searchParam === "string") {
        searchTerm = searchParam;
      } else if (searchParam && typeof searchParam === "object") {
        // Check if it's an event object
        if (
          "target" in searchParam &&
          searchParam.target &&
          "value" in searchParam.target
        ) {
          searchTerm = searchParam.target.value;
        }
        // Check if it's a React SyntheticEvent
        else if (
          "currentTarget" in searchParam &&
          searchParam.currentTarget &&
          "value" in searchParam.currentTarget
        ) {
          searchTerm = searchParam.currentTarget.value;
        }
        // Check if it has a searchTerm property
        else if ("searchTerm" in searchParam) {
          searchTerm = searchParam.searchTerm;
        }
        // Check if it has a value property
        else if ("value" in searchParam) {
          searchTerm = searchParam.value;
        }
        // If it's an object but none of the above, try to convert to string
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
      // Ensure parameters are strings and handle edge cases
      let searchStr = "";
      let replaceStr = "";

      try {
        if (typeof searchTerm === "string") {
          searchStr = searchTerm;
        } else {
          searchStr = String(searchTerm || "");
        }

        if (typeof replaceTerm === "string") {
          replaceStr = replaceTerm;
        } else {
          replaceStr = String(replaceTerm || "");
        }

        // Sanitize the replacement string by escaping special characters
        replaceStr = replaceStr.replace(/\$/g, "$$$$"); // Escape $ in replacement string
      } catch (error) {
        console.error("Error converting replace parameters to strings:", error);
        return;
      }

      if (!searchStr || searchStr.trim() === "") {
        return;
      }

      editor.update(() => {
        const root = $getRoot();
        const textContent = root.getTextContent();
        let newContent = textContent;

        if (replaceAll) {
          try {
            // Escape the search string for use in regex
            const escapedSearchStr = searchStr.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            );
            const regex = new RegExp(escapedSearchStr, "gi");
            newContent = textContent.replace(regex, replaceStr);
          } catch (error) {
            console.error("Error in regex replace:", error);
            return;
          }
        } else {
          const index = textContent
            .toLowerCase()
            .indexOf(searchStr.toLowerCase());
          if (index !== -1) {
            newContent =
              textContent.substring(0, index) +
              replaceStr +
              textContent.substring(index + searchStr.length);
          }
        }

        if (newContent !== textContent) {
          root.clear();
          const paragraph = $createParagraphNode();
          const textNode = $createTextNode(newContent);
          paragraph.append(textNode);
          root.append(paragraph);

          // Trigger text change callback
          if (onTextChange) {
            onTextChange(newContent);
          }

          // Update search results if we have an active search
          if (currentSearchTerm) {
            const matches = findMatches(newContent, currentSearchTerm);
            setCurrentMatches(matches);
            setCurrentMatchIndex(matches.length > 0 ? 0 : -1);

            if (matches.length > 0) {
              applyHighlights(matches, currentSearchTerm.length, 0);
            } else {
              clearHighlights();
            }
          }
        }
      });
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
