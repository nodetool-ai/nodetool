/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, Typography, IconButton, Tooltip } from "@mui/material";
import { memo, useCallback, useMemo, useRef, useState, useEffect } from "react";
import { EditorState } from "lexical";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import debounce from "lodash/debounce";

import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import LexicalPlugins from "../textEditor/LexicalEditor";
import ToolbarPlugin from "../textEditor/ToolbarPlugin";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { HorizontalRuleNode } from "../textEditor/HorizontalRuleNode";
import { $convertFromMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import InfoIcon from "@mui/icons-material/Info";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: "100%",
    overflow: "hidden",
    backgroundColor: theme.vars.palette.background.default,

    ".notes-header": {
      padding: theme.spacing(2, 2, 1),
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    },

    ".notes-title": {
      fontSize: theme.fontSizeNormal,
      fontWeight: 600,
      color: theme.vars.palette.text.primary,
      margin: 0
    },

    ".notes-description": {
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.text.secondary,
      marginTop: theme.spacing(0.5)
    },

    ".editor-container": {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      position: "relative",
      minHeight: 0
    },

    ".editor-wrapper": {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      padding: theme.spacing(2),
      minHeight: 0
    },

    ".text-editor-container": {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      minHeight: 0,
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: theme.spacing(1),
      border: `1px solid ${theme.vars.palette.divider}`,
      position: "relative",

      "& .editor-input": {
        flex: 1,
        overflowY: "auto",
        padding: theme.spacing(2),
        fontSize: theme.fontSizeSmall,
        lineHeight: "1.6",
        color: theme.vars.palette.text.primary
      },

      "& .editor-placeholder": {
        color: theme.vars.palette.text.disabled,
        top: theme.spacing(2),
        left: theme.spacing(2)
      }
    },

    ".format-toolbar-container": {
      position: "absolute",
      top: theme.spacing(1),
      right: theme.spacing(1),
      zIndex: 1,
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: theme.spacing(0.5),
      border: `1px solid ${theme.vars.palette.divider}`,
      padding: theme.spacing(0.5),
      boxShadow: theme.shadows[1],
      opacity: 0.9,
      transition: "opacity 0.2s ease",

      "&:hover": {
        opacity: 1
      }
    },

    ".empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      padding: theme.spacing(4),
      textAlign: "center",
      color: theme.vars.palette.text.secondary,

      "& .empty-icon": {
        fontSize: "48px",
        marginBottom: theme.spacing(2),
        opacity: 0.5
      },

      "& .empty-title": {
        fontSize: theme.fontSizeNormal,
        fontWeight: 500,
        marginBottom: theme.spacing(1)
      },

      "& .empty-text": {
        fontSize: theme.fontSizeSmall
      }
    }
  });

const editorConfigTemplate = {
  namespace: "WorkflowNotesEditor",
  onError: (error: Error) => {
    console.error("Workflow Notes Editor Error:", error);
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

const WorkflowNotesPanel = memo(function WorkflowNotesPanel() {
  const theme = useTheme();
  const currentWorkflowId = useWorkflowManager((state) => state.currentWorkflowId);
  const currentWorkflow = useWorkflowManager((state) => state.getCurrentWorkflow());
  const updateWorkflow = useWorkflowManager((state) => state.updateWorkflow);
  const [isSaving, setIsSaving] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editorConfig = useMemo(() => {
    const config: any = { ...editorConfigTemplate };

    const notes = (currentWorkflow as any)?.notes;

    // Handle string notes as markdown
    if (typeof notes === "string" && notes.length > 0) {
      config.editorState = (_editor: unknown) => {
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
  }, [(currentWorkflow as any)?.notes]);

  // Debounced save function
  const debouncedSave = useMemo(
    () =>
      debounce((newEditorState: EditorState) => {
        if (!currentWorkflowId || !currentWorkflow) {
          return;
        }

        setIsSaving(true);

        // Clear any existing timeout
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }

        // Set a new timeout to actually save
        saveTimeoutRef.current = setTimeout(() => {
          const notesJson = newEditorState.toJSON();
          const updatedWorkflow = {
            ...currentWorkflow,
            notes: notesJson
          };

          updateWorkflow(updatedWorkflow);
          setIsSaving(false);
        }, 500);
      }, 300),
    [currentWorkflowId, currentWorkflow, updateWorkflow]
  );

  const handleEditorChange = useCallback(
    (editorState: EditorState) => {
      debouncedSave(editorState);
    },
    [debouncedSave]
  );

  // Cleanup debounced function on unmount
  useEffect(() => {
    return () => {
      debouncedSave.cancel();
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [debouncedSave]);

  if (!currentWorkflow) {
    return (
      <Box css={styles(theme)} className="workflow-notes-panel">
        <div className="empty-state">
          <InfoIcon className="empty-icon" />
          <div className="empty-title">No Workflow Selected</div>
          <div className="empty-text">Open a workflow to add notes</div>
        </div>
      </Box>
    );
  }

  return (
    <Box css={styles(theme)} className="workflow-notes-panel">
      <div className="notes-header">
        <div>
          <Typography variant="h6" className="notes-title">
            Workflow Notes
          </Typography>
          <Typography variant="caption" className="notes-description">
            {currentWorkflow.name}
            {isSaving && " (Saving...)"}
          </Typography>
        </div>
        <Tooltip title="Notes are saved automatically as you type">
          <IconButton size="small" edge="end">
            <InfoIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </div>

      <div className="editor-container">
        <div className="editor-wrapper">
          <LexicalComposer initialConfig={editorConfig}>
            <div className="text-editor-container">
              <div className="format-toolbar-container">
                <ToolbarPlugin />
              </div>
              <LexicalPlugins onChange={handleEditorChange} />
            </div>
          </LexicalComposer>
        </div>
      </div>
    </Box>
  );
});

export default WorkflowNotesPanel;

