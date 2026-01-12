/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useCallback, useState, useRef, useMemo } from "react";
import {
  Box,
  IconButton,
  Typography,
  Collapse,
  Button,
  Tooltip
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  Edit as EditIcon,
  Close as CloseIcon,
  PushPin as PinIcon
} from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import LexicalPlugins from "../textEditor/LexicalEditor";
import {
  $convertFromMarkdownString,
  TRANSFORMERS
} from "@lexical/markdown";
import type { EditorState } from "lexical";
import {
  HeadingNode,
  QuoteNode
} from "@lexical/rich-text";
import {
  ListItemNode,
  ListNode
} from "@lexical/list";
import {
  CodeHighlightNode,
  CodeNode
} from "@lexical/code";
import {
  AutoLinkNode,
  LinkNode
} from "@lexical/link";
import { HorizontalRuleNode } from "../textEditor/HorizontalRuleNode";
import ToolbarPlugin from "../textEditor/ToolbarPlugin";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

const styles = (theme: Theme) =>
  css({
    position: "absolute",
    top: theme.spacing(1),
    right: theme.spacing(1),
    width: "320px",
    maxHeight: "calc(100% - 80px)",
    zIndex: 100,
    display: "flex",
    flexDirection: "column",
    transition: "all 0.2s ease",
    
    "& .doc-panel": {
      backgroundColor: theme.vars.palette.c_panel_bg || "rgba(20, 20, 25, 0.95)",
      backdropFilter: "blur(12px)",
      borderRadius: "8px",
      border: `1px solid ${theme.vars.palette.divider}`,
      boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    },
    
    "& .doc-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: theme.spacing(1, 1.5),
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.c_panel_header || "rgba(30, 30, 35, 0.95)"
    },
    
    "& .doc-title": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      fontSize: theme.fontSizeSmall,
      fontWeight: 600,
      color: theme.vars.palette.text.primary,
      textTransform: "uppercase",
      letterSpacing: "0.05em"
    },
    
    "& .doc-header-actions": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5)
    },
    
    "& .doc-content": {
      flex: 1,
      overflow: "auto",
      padding: theme.spacing(1.5),
      minHeight: "60px",
      maxHeight: "300px",
      
      "& .editor-input": {
        minHeight: "40px",
        padding: theme.spacing(1),
        fontSize: theme.fontSizeSmall,
        color: theme.vars.palette.text.primary,
        backgroundColor: "transparent",
        border: "none",
        outline: "none",
        resize: "none",
        width: "100%",
        fontFamily: theme.fontFamily1
      },
      
      "& .text-content": {
        fontSize: theme.fontSizeSmall,
        color: theme.vars.palette.text.secondary,
        lineHeight: 1.6,
        fontFamily: theme.fontFamily1,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word"
      }
    },
    
    "& .doc-empty": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: theme.spacing(3),
      color: theme.vars.palette.text.disabled,
      fontSize: theme.fontSizeSmall,
      fontStyle: "italic"
    },
    
    "& .doc-view-mode": {
      padding: theme.spacing(1.5),
      color: theme.vars.palette.text.secondary,
      fontSize: theme.fontSizeSmall,
      lineHeight: 1.6,
      fontFamily: theme.fontFamily1,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word"
    },
    
    "& .doc-footer": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: theme.spacing(1, 1.5),
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.c_panel_header || "rgba(30, 30, 35, 0.95)"
    },
    
    "& .doc-actions": {
      display: "flex",
      gap: theme.spacing(1)
    },
    
    "& .toggle-button": {
      transition: "transform 0.2s ease",
      "&.expanded": {
        transform: "rotate(180deg)"
      }
    },
    
    "& .format-toolbar-container": {
      display: "none"
    }
  });

const initialConfigTemplate = {
  namespace: "WorkflowDocEditor",
  onError: (error: Error) => {
    console.error(error);
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

interface WorkflowDocumentationPanelProps {
  workflowId?: string;
}

const WorkflowDocumentationPanel: React.FC<WorkflowDocumentationPanelProps> = () => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const contentOnFocusRef = useRef<EditorState | null>(null);

  const { getCurrentWorkflow, saveWorkflow } = useWorkflowManager(
    (state) => ({
      getCurrentWorkflow: state.getCurrentWorkflow,
      saveWorkflow: state.saveWorkflow
    })
  );

  const workflow = getCurrentWorkflow();
  const description = workflow?.description || "";

  const editorConfig = useMemo(() => {
    const config: any = {
      ...initialConfigTemplate
    };

    if (typeof description === "string" && description.length > 0) {
      config.editorState = (_editor: any) => {
        $convertFromMarkdownString(description, TRANSFORMERS);
      };
    } else if (
      typeof description === "object" &&
      description !== null &&
      "root" in description &&
      Object.keys(description).length > 0
    ) {
      config.editorState = JSON.stringify(description);
    }

    return config;
  }, [description]);

  const handleEditorChange = useCallback(
    (editorState: EditorState) => {
      if (!contentOnFocusRef.current) {
        contentOnFocusRef.current = editorState;
      }
      setIsDirty(true);
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!workflow || !isDirty) {return;}

    const editorElement = editorRef.current?.querySelector(
      ".editor-input"
    ) as HTMLDivElement;

    let newDescription = description;
    if (editorElement && contentOnFocusRef.current) {
      const json = contentOnFocusRef.current.toJSON();
      newDescription = JSON.stringify(json);
    }

    const updatedWorkflow = {
      ...workflow,
      description: newDescription
    };

    await saveWorkflow(updatedWorkflow);
    setIsDirty(false);
  }, [workflow, description, isDirty, saveWorkflow]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setIsDirty(false);
    contentOnFocusRef.current = null;
  }, []);

  const handleToggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const handleToggleEdit = useCallback(() => {
    if (isEditing && isDirty) {
      handleSave();
    }
    setIsEditing((prev) => !prev);
  }, [isEditing, isDirty, handleSave]);

  const renderContent = () => {
    if (!description || (typeof description === "string" && description.trim() === "")) {
      return (
        <div className="doc-empty">
          No documentation yet. Click Edit to add a description.
        </div>
      );
    }

    if (isEditing) {
      return (
        <div ref={editorRef} className="text-editor-container">
          <LexicalComposer initialConfig={editorConfig}>
            <ToolbarPlugin />
            <LexicalPlugins
              onChange={handleEditorChange}
              onFocusChange={() => {}}
            />
          </LexicalComposer>
        </div>
      );
    }

    return (
      <div className="doc-view-mode">
        {typeof description === "string" ? (
          description
        ) : (
          JSON.stringify(description)
        )}
      </div>
    );
  };

  return (
    <Box css={styles(theme)}>
      <Box className="doc-panel">
        <Box className="doc-header">
          <Box className="doc-title">
            <PinIcon fontSize="small" />
            <Typography>Documentation</Typography>
          </Box>
          <Box className="doc-header-actions">
            <Tooltip title={isEditing ? (isDirty ? "Save changes" : "Cancel") : "Edit documentation"}>
              <IconButton size="small" onClick={handleToggleEdit}>
                {isEditing ? (
                  isDirty ? (
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>Save</Typography>
                  ) : (
                    <CloseIcon fontSize="small" />
                  )
                ) : (
                  <EditIcon fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
            <Tooltip title={expanded ? "Collapse" : "Expand"}>
              <IconButton
                size="small"
                className={`toggle-button ${expanded ? "expanded" : ""}`}
                onClick={handleToggleExpanded}
              >
                <ExpandMoreIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        <Collapse in={expanded}>
          <Box className="doc-content">
            {renderContent()}
          </Box>
          <Box className="doc-footer">
            <Typography variant="caption" color="text.secondary">
              {isDirty ? "Unsaved changes" : "Ctrl/Cmd+S to save"}
            </Typography>
            <Box className="doc-actions">
              {isEditing && (
                <>
                  <Button size="small" onClick={handleCancel}>
                    Cancel
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={handleSave}
                    disabled={!isDirty}
                  >
                    Save
                  </Button>
                </>
              )}
            </Box>
          </Box>
        </Collapse>
      </Box>
    </Box>
  );
};

export default WorkflowDocumentationPanel;
