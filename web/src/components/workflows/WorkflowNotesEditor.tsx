/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useRef, useMemo } from "react";
import debounce from "lodash/debounce";
import isEqual from "lodash/isEqual";
import { Box, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import NotesIcon from "@mui/icons-material/Notes";
import LexicalPlugins from "../textEditor/LexicalEditor";
import {
  EditorState
} from "lexical";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import ToolbarPlugin from "../textEditor/ToolbarPlugin";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { HorizontalRuleNode } from "../textEditor/HorizontalRuleNode";
import { $convertFromMarkdownString, TRANSFORMERS } from "@lexical/markdown";

const styles = (theme: Theme) =>
  css({
    width: "100%",
    minHeight: "150px",
    position: "relative",
    backgroundColor: theme.vars.palette.grey[900],
    borderRadius: "6px",
    border: `1px solid ${theme.vars.palette.grey[700]}`,
    transition: "all 0.2s ease",
    "&:hover": {
      borderColor: theme.vars.palette.grey[500]
    },
    "&:focus-within": {
      borderColor: "var(--palette-primary-main)",
      borderWidth: "1px"
    },
    ".notes-header": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      padding: theme.spacing(1, 1.5),
      borderBottom: `1px solid ${theme.vars.palette.grey[800]}`,
      backgroundColor: theme.vars.palette.action.hover,
      borderRadius: "6px 6px 0 0"
    },
    ".notes-title": {
      fontSize: theme.fontSizeSmall,
      fontWeight: 500,
      color: theme.vars.palette.grey[200],
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5)
    },
    ".notes-hint": {
      fontSize: "0.7rem",
      color: theme.vars.palette.grey[400],
      marginLeft: "auto"
    },
    ".notes-editor-container": {
      position: "relative",
      minHeight: "120px",
      maxHeight: "400px",
      overflow: "hidden"
    },
    ".format-toolbar-container": {
      display: "flex",
      position: "absolute",
      top: "-35px",
      left: "0",
      width: "100%",
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: theme.vars.palette.grey[800],
      borderRadius: "3px",
      padding: "0.25em 0.5em",
      zIndex: 1,
      opacity: 0,
      transition: "opacity 0.2s .2s ease",
      border: `1px solid ${theme.vars.palette.grey[700]}`
    },
    "&:hover .format-toolbar-container": {
      opacity: 1
    },
    ".text-editor-container": {
      width: "100%",
      height: "100%",
      minHeight: "120px",
      maxHeight: "400px",
      overflowY: "auto",
      overflowX: "hidden",
      padding: theme.spacing(1, 1.5),
      "& .editor-input": {
        minHeight: "100px",
        fontSize: theme.fontSizeSmall,
        lineHeight: "1.5em",
        caretColor: theme.vars.palette.primary.contrastText,
        p: {
          margin: 0
        }
      }
    }
  });

const editorConfigTemplate = {
  namespace: "WorkflowNotesEditor",
  onError: (error: Error) => {
    console.error("Workflow notes editor error:", error);
  },
  nodes: [
    HeadingNode,
    QuoteNode,
    ListNode,
    ListItemNode,
    CodeNode,
    CodeHighlightNode,
    AutoLinkNode,
    LinkNode,
    HorizontalRuleNode
  ],
  theme: {
    text: {
      large: "font-size-large",
      bold: "editor-text-bold",
      italic: "editor-text-italic",
      underline: "editor-text-underline",
      strikethrough: "editor-text-strikethrough",
      code: "editor-text-code"
    },
    link: "editor-link",
    code: "editor-code",
    heading: {
      h1: "editor-heading-h1",
      h2: "editor-heading-h2",
      h3: "editor-heading-h3",
      h4: "editor-heading-h4",
      h5: "editor-heading-h5",
      h6: "editor-heading-h6"
    },
    list: {
      ul: "editor-list-ul",
      ol: "editor-list-ol",
      listitem: "editor-listitem"
    },
    quote: "editor-quote"
  }
};

export interface WorkflowNotesEditorProps {
  /**
   * The notes content - can be a markdown string or Lexical editor state
   */
  notes: string | null | undefined;
  /**
   * Callback when notes change (debounced)
   */
  onNotesChange: (notes: string) => void;
  /**
   * Optional placeholder text
   */
  placeholder?: string;
}

/**
 * WorkflowNotesEditor - A rich text editor component for workflow notes.
 *
 * Features:
 * - Rich text editing with markdown support
 * - Debounced saves (500ms) to prevent excessive updates
 * - Formatting toolbar (bold, italic, large font, horizontal rule, copy as markdown)
 * - Auto-resizing container
 * - Theme-aware styling
 *
 * @example
 * ```tsx
 * <WorkflowNotesEditor
 *   notes={workflow.settings?.notes || ""}
 *   onNotesChange={(notes) => updateWorkflowSettings({ notes })}
 *   placeholder="Add notes about this workflow..."
 * />
 * ```
 */
const WorkflowNotesEditor: React.FC<WorkflowNotesEditorProps> = ({
  notes,
  onNotesChange,
  _placeholder = "Add notes about this workflow..."
}) => {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const contentOnFocusRef = useRef<EditorState | null>(null);

  const editorConfig = useMemo(() => {
    const config: any = {
      ...editorConfigTemplate
    };

    // Handle string notes as markdown
    if (typeof notes === "string" && notes.length > 0) {
      config.editorState = (_editor: any) => {
        $convertFromMarkdownString(notes, TRANSFORMERS);
      };
    }
    // Handle existing Lexical editor state
    else if (
      notes &&
      typeof notes === "object" &&
      "root" in notes &&
      Object.keys(notes).length > 0
    ) {
      config.editorState = JSON.stringify(notes);
    }

    return config;
  }, [notes]);

  const debouncedUpdate = useMemo(
    () =>
      debounce((newEditorState: EditorState) => {
        const jsonState = JSON.stringify(newEditorState.toJSON());
        onNotesChange(jsonState);
      }, 500),
    [onNotesChange]
  );

  const handleEditorChange = useCallback(
    (editorState: EditorState) => {
      if (!contentOnFocusRef.current) {
        contentOnFocusRef.current = editorState;
      }
      debouncedUpdate(editorState);
    },
    [debouncedUpdate]
  );

  const handleBlur = useCallback(
    (latestEditorState: EditorState) => {
      // Force save on blur if content changed
      if (
        contentOnFocusRef.current &&
        !isEqual(contentOnFocusRef.current.toJSON(), latestEditorState.toJSON())
      ) {
        const jsonState = JSON.stringify(latestEditorState.toJSON());
        onNotesChange(jsonState);
      }
      contentOnFocusRef.current = null;
    },
    [onNotesChange]
  );

  return (
    <Box css={styles(theme)} className="workflow-notes-editor" ref={containerRef}>
      {/* Header */}
      <div className="notes-header">
        <Typography className="notes-title">
          <NotesIcon sx={{ fontSize: "1em" }} />
          Workflow Notes
        </Typography>
        <Typography className="notes-hint">
          Use markdown formatting
        </Typography>
      </div>

      {/* Editor with toolbar */}
      <div className="notes-editor-container">
        <div className="format-toolbar-container">
          <ToolbarPlugin />
        </div>
        <LexicalComposer initialConfig={editorConfig}>
          <div className="text-editor-container">
            <LexicalPlugins
              onChange={handleEditorChange}
              onBlur={handleBlur}
              wordWrapEnabled={true}
            />
          </div>
        </LexicalComposer>
      </div>
    </Box>
  );
};

export default memo(WorkflowNotesEditor, (prevProps, nextProps) => {
  return prevProps.notes === nextProps.notes &&
    prevProps.onNotesChange === nextProps.onNotesChange &&
    prevProps.placeholder === nextProps.placeholder;
});
