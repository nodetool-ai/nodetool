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
  $isParagraphNode
} from "lexical";

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
  initialContent
}: EditorControllerProps) => {
  const [editor] = useLexicalComposerContext();
  const [initialContentSet, setInitialContentSet] = useState(false);
  const [currentSearchTerm, setCurrentSearchTerm] = useState("");
  const [currentMatches, setCurrentMatches] = useState<number[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  // Set initial content only once
  useEffect(() => {
    if (initialContent && initialContent.trim() && !initialContentSet) {
      console.log("Setting initial content:", initialContent);

      // Use setTimeout to avoid setting state during render
      setTimeout(() => {
        editor.update(() => {
          const root = $getRoot();
          const currentText = root.getTextContent();

          // Only set if editor is empty
          if (!currentText || currentText.trim() === "") {
            root.clear();
            const paragraph = $createParagraphNode();
            const textNode = $createTextNode(initialContent);
            paragraph.append(textNode);
            root.append(paragraph);
            console.log("Initial content set successfully");
          }
        });
        setInitialContentSet(true);
      }, 0);
    }
  }, [editor, initialContent, initialContentSet]);

  // Set up undo function
  const undoFn = useCallback(() => {
    console.log("Dispatching UNDO_COMMAND");

    editor.update(() => {
      console.log(
        "Current editor content before undo:",
        $getRoot().getTextContent()
      );
    });

    const result = editor.dispatchCommand(UNDO_COMMAND, undefined);
    console.log("Undo command result:", result);

    // Use setTimeout to check content after undo completes
    setTimeout(() => {
      editor.getEditorState().read(() => {
        console.log("Editor content after undo:", $getRoot().getTextContent());
      });
    }, 0);
  }, [editor]);

  // Set up redo function
  const redoFn = useCallback(() => {
    console.log("Dispatching REDO_COMMAND");

    editor.update(() => {
      console.log(
        "Current editor content before redo:",
        $getRoot().getTextContent()
      );
    });

    const result = editor.dispatchCommand(REDO_COMMAND, undefined);
    console.log("Redo command result:", result);

    // Use setTimeout to check content after redo completes
    setTimeout(() => {
      editor.getEditorState().read(() => {
        console.log("Editor content after redo:", $getRoot().getTextContent());
      });
    }, 0);
  }, [editor]);

  useEffect(() => {
    // Utility: given a global char index, create a DOM Range covering the match
    const highlightMatch = (matchStart: number, matchLength: number) => {
      const rootElement = editor.getRootElement();
      if (!rootElement) return;

      // Build a list of all text nodes in order
      const walker = document.createTreeWalker(
        rootElement,
        NodeFilter.SHOW_TEXT,
        null
      );
      let node: Node | null = null;
      let charCount = 0;

      while ((node = walker.nextNode())) {
        const textContent = node.textContent || "";
        const nextCharCount = charCount + textContent.length;

        if (matchStart < nextCharCount) {
          // The match begins somewhere in this node
          const range = document.createRange();
          const startOffset = matchStart - charCount;
          const endOffset = startOffset + matchLength;
          range.setStart(node, startOffset);
          range.setEnd(node, endOffset);

          const sel = window.getSelection();
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
          }
          break;
        }

        charCount = nextCharCount;
      }
    };

    const findMatches = (text: string, searchTerm: string): number[] => {
      const matches: number[] = [];
      const lowerText = text.toLowerCase();
      const lowerSearchTerm = searchTerm.toLowerCase();
      let index = 0;

      while ((index = lowerText.indexOf(lowerSearchTerm, index)) !== -1) {
        matches.push(index);
        index += searchTerm.length;
      }

      return matches;
    };

    // Set up find function
    const findFn = (searchParam: any) => {
      // Enhanced debugging - let's see what those 2 keys are
      if (searchParam && typeof searchParam === "object") {
        console.log("findFn called with object:", {
          searchTerm: searchParam,
          type: typeof searchParam,
          keys: Object.keys(searchParam),
          values: Object.values(searchParam),
          keyValuePairs: Object.entries(searchParam),
          target: searchParam?.target,
          currentTarget: searchParam?.currentTarget,
          isString: typeof searchParam === "string",
          isEvent:
            searchParam &&
            typeof searchParam === "object" &&
            "target" in searchParam
        });
      } else {
        console.log("findFn called with:", {
          searchTerm: searchParam,
          type: typeof searchParam,
          isString: typeof searchParam === "string"
        });
      }

      // Extract string from various input types
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
          console.warn(
            "Unexpected object type in findFn, keys:",
            Object.keys(searchParam)
          );
          console.warn("Object entries:", Object.entries(searchParam));
          searchTerm = "";
        }
      } else if (searchParam === null || searchParam === undefined) {
        searchTerm = "";
      } else {
        // Convert other types to string
        searchTerm = String(searchParam);
      }

      console.log("Extracted search term:", searchTerm);

      if (!searchTerm || searchTerm.trim() === "") {
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

      // Highlight first match if available
      if (matches.length > 0) {
        highlightMatch(matches[0], searchTerm.length);
      } else if (window.getSelection()) {
        // Clear existing selection when no matches.
        window.getSelection()?.removeAllRanges();
      }

      return {
        totalMatches: matches.length,
        currentMatch: matches.length > 0 ? 1 : 0
      };
    };

    const navigateFn = (direction: "next" | "previous") => {
      if (currentMatches.length === 0) {
        return { currentMatch: 0, totalMatches: 0 };
      }

      let newIndex = currentMatchIndex;

      if (direction === "next") {
        newIndex = (currentMatchIndex + 1) % currentMatches.length;
      } else {
        newIndex =
          currentMatchIndex <= 0
            ? currentMatches.length - 1
            : currentMatchIndex - 1;
      }

      setCurrentMatchIndex(newIndex);

      // Highlight the chosen match
      if (currentMatches.length > 0) {
        highlightMatch(currentMatches[newIndex], currentSearchTerm.length);
      }

      return {
        currentMatch: newIndex + 1,
        totalMatches: currentMatches.length
      };
    };

    const replaceFn = (
      searchTerm: any,
      replaceTerm: any,
      replaceAll?: boolean
    ) => {
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
          const regex = new RegExp(
            searchStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            "gi"
          );
          newContent = textContent.replace(regex, replaceStr);
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
              highlightMatch(matches[0], currentSearchTerm.length);
            } else {
              window.getSelection()?.removeAllRanges();
            }
          }
        }
      });
    };

    // Provide functions to parent - moved outside useEffect to prevent render issues
    onUndoCommand?.(undoFn);
    onRedoCommand?.(redoFn);
    onFindCommand?.(findFn);
    onReplaceCommand?.(replaceFn);
    onNavigateCommand?.(navigateFn);

    // Listen for history state changes
    const removeCanUndoListener = editor.registerCommand(
      CAN_UNDO_COMMAND,
      (canUndo: boolean) => {
        onCanUndoChange?.(canUndo);
        return false;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    const removeCanRedoListener = editor.registerCommand(
      CAN_REDO_COMMAND,
      (canRedo: boolean) => {
        onCanRedoChange?.(canRedo);
        return false;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    return () => {
      removeCanUndoListener();
      removeCanRedoListener();
    };
  }, [
    editor,
    onCanUndoChange,
    onCanRedoChange,
    onTextChange,
    onUndoCommand,
    onRedoCommand,
    onFindCommand,
    onReplaceCommand,
    onNavigateCommand,
    currentSearchTerm,
    currentMatches,
    currentMatchIndex,
    undoFn,
    redoFn
  ]);

  return null; // This component doesn't render anything
};

export default EditorController;
