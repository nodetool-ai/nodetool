/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Button,
  Typography,
  Tooltip,
  IconButton
} from "@mui/material";
import debounce from "lodash/debounce";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { Workflow } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useNotificationStore } from "../../stores/NotificationStore";
import LexicalPlugins from "../textEditor/LexicalEditor";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import ToolbarPlugin from "../textEditor/ToolbarPlugin";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { HorizontalRuleNode } from "../textEditor/HorizontalRuleNode";
import {
  $convertFromMarkdownString,
  TRANSFORMERS
} from "@lexical/markdown";
import {
  EditorState
} from "lexical";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import SaveIcon from "@mui/icons-material/Save";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    backgroundColor: theme.vars.palette.background.default,

    ".documentation-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: theme.spacing(2, 3),
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.grey[900],
      minHeight: "64px"
    },

    ".header-title": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1.5)
    },

    ".header-title h3": {
      margin: 0,
      fontSize: "1.1rem",
      fontWeight: 600,
      color: theme.vars.palette.grey[0],
      letterSpacing: "-0.02em"
    },

    ".documentation-content": {
      flex: 1,
      overflow: "auto",
      padding: theme.spacing(3)
    },

    ".info-box": {
      backgroundColor: `${theme.vars.palette.primary.main}15`,
      border: `1px solid ${theme.vars.palette.primary.main}30`,
      borderRadius: "8px",
      padding: theme.spacing(2),
      marginBottom: theme.spacing(3)
    },

    ".info-box p": {
      margin: 0,
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.grey[300],
      lineHeight: 1.5
    },

    ".section-title": {
      fontSize: theme.fontSizeSmall,
      fontWeight: 600,
      color: theme.vars.palette.grey[300],
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      marginBottom: theme.spacing(1.5)
    },

    ".editor-container": {
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      borderRadius: "8px",
      backgroundColor: theme.vars.palette.grey[900],
      overflow: "hidden",
      transition: "border-color 0.2s ease",
      "&:hover": {
        borderColor: theme.vars.palette.grey[500]
      },
      "&.focused": {
        borderColor: theme.vars.palette.primary.main
      }
    },

    ".editor-toolbar": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5),
      padding: theme.spacing(1, 1.5),
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`,
      backgroundColor: theme.vars.palette.grey[800]
    },

    ".editor-input-wrapper": {
      padding: theme.spacing(2)
    },

    ".editor-input": {
      minHeight: "200px",
      maxHeight: "400px",
      overflow: "auto",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal,
      lineHeight: 1.6,
      color: theme.vars.palette.grey[0],
      "& .editor-input": {
        minHeight: "180px",
        padding: 0,
        outline: "none"
      }
    },

    ".save-section": {
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: theme.spacing(1),
      padding: theme.spacing(2, 3),
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.grey[900]
    },

    ".save-button": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      background: `linear-gradient(135deg, var(--palette-primary-main) 0%, ${theme.vars.palette.primary.dark} 100%)`,
      color: theme.vars.palette.primary.contrastText,
      padding: "8px 20px",
      fontSize: theme.fontSizeSmall,
      fontWeight: 600,
      textTransform: "none",
      borderRadius: "6px",
      border: "none",
      boxShadow: `0 2px 8px ${theme.vars.palette.primary.main}4d`,
      transition: "all 0.2s ease",
      "&:hover": {
        boxShadow: `0 4px 12px ${theme.vars.palette.primary.main}66`,
        transform: "translateY(-1px)"
      },
      "&:disabled": {
        opacity: 0.6,
        transform: "none"
      }
    },

    ".cancel-button": {
      backgroundColor: "transparent",
      color: theme.vars.palette.grey[200],
      padding: "8px 16px",
      fontSize: theme.fontSizeSmall,
      fontWeight: 500,
      textTransform: "none",
      borderRadius: "6px",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[700]
      }
    },

    ".status-text": {
      fontSize: theme.fontSizeTiny,
      color: theme.vars.palette.grey[400],
      marginRight: "auto"
    }
  });

const initialConfigTemplate = {
  namespace: "WorkflowDocumentationEditor",
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
  workflow: Workflow;
  onClose: () => void;
}

const WorkflowDocumentationPanel = ({
  workflow,
  onClose: _onClose
}: WorkflowDocumentationPanelProps) => {
  const theme = useTheme();
  const [localNotes, setLocalNotes] = useState<string>(
    (workflow.settings?.notes as string | undefined) || ""
  );
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const { saveWorkflow } = useWorkflowManager((state) => ({
    saveWorkflow: state.saveWorkflow
  }));
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  useEffect(() => {
    const workflowNotes = workflow.settings?.notes as string | undefined;
    setLocalNotes(workflowNotes || "");
    setHasChanges(false);
  }, [workflow]);

  const editorConfig = useMemo(() => {
    const config: any = {
      ...initialConfigTemplate
    };

    const notes = localNotes;

    if (typeof notes === "string" && notes.length > 0) {
      config.editorState = (_editor: any) => {
        $convertFromMarkdownString(notes, TRANSFORMERS);
      };
    }

    return config;
  }, [localNotes]);

  const debouncedUpdate = useMemo(
    () =>
      debounce((newNotes: string) => {
        setLocalNotes(newNotes);
        setHasChanges(true);
      }, 300),
    []
  );

  const handleEditorChange = useCallback(
    (editorState: EditorState) => {
      const json = editorState.toJSON();
      const textContent = extractTextFromEditorState(json);
      debouncedUpdate(textContent);
    },
    [debouncedUpdate]
  );

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const updatedWorkflow: Workflow = {
        ...workflow,
        settings: {
          ...workflow.settings,
          notes: localNotes
        }
      };
      await saveWorkflow(updatedWorkflow);
      setHasChanges(false);
      addNotification({
        type: "success",
        alert: true,
        content: "Documentation saved!",
        dismissable: true
      });
    } catch {
      addNotification({
        type: "error",
        alert: true,
        content: "Failed to save documentation",
        dismissable: true
      });
    } finally {
      setIsSaving(false);
    }
  }, [workflow, localNotes, saveWorkflow, addNotification]);

  const handleCancel = useCallback(() => {
    const workflowNotes = workflow.settings?.notes as string | undefined;
    setLocalNotes(workflowNotes || "");
    setHasChanges(false);
  }, [workflow]);

  return (
    <div css={styles(theme)} className="documentation-panel">
      <div className="documentation-header">
        <div className="header-title">
          <Typography variant="h3">Workflow Documentation</Typography>
        </div>
        <Tooltip
          title={
            <div className="tooltip-span">
              <div className="tooltip-title">Documentation</div>
              <div className="tooltip-key">
                Add rich text documentation to help others understand this workflow
              </div>
            </div>
          }
          placement="bottom-end"
          enterDelay={TOOLTIP_ENTER_DELAY}
        >
          <IconButton size="small">
            <HelpOutlineIcon />
          </IconButton>
        </Tooltip>
      </div>

      <div className="documentation-content">
        <div className="info-box">
          <Typography variant="body2">
            Use this section to document your workflow. Add descriptions, usage
            instructions, examples, and any other information that helps others
            understand and use this workflow effectively.
          </Typography>
        </div>

        <Typography className="section-title">Documentation Notes</Typography>

        <div
          className={`editor-container ${isEditorFocused ? "focused" : ""}`}
        >
          <LexicalComposer initialConfig={editorConfig}>
            <div className="editor-toolbar">
              <ToolbarPlugin />
            </div>
            <div className="editor-input-wrapper">
              <LexicalPlugins
                onChange={handleEditorChange}
                onFocusChange={setIsEditorFocused}
              />
            </div>
          </LexicalComposer>
        </div>
      </div>

      <div className="save-section">
        <span className="status-text">
          {hasChanges ? "Unsaved changes" : ""}
        </span>
        <Button
          className="cancel-button"
          onClick={handleCancel}
          disabled={!hasChanges || isSaving}
        >
          Cancel
        </Button>
        <Button
          className="save-button"
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          startIcon={<SaveIcon />}
        >
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
};

function extractTextFromEditorState(json: any): string {
  if (!json || !json.root) {
    return "";
  }

  const extractTextFromNode = (node: any): string => {
    if (!node) {
      return "";
    }

    if (node.text) {
      return node.text;
    }

    if (node.children && Array.isArray(node.children)) {
      return node.children.map(extractTextFromNode).join("");
    }

    if (node.type === "horizontalrule") {
      return "\n---\n";
    }

    if (node.type === "list") {
      const marker = node.listType === "ordered" ? "1." : "-";
      if (node.children && Array.isArray(node.children)) {
        return node.children
          .map((child: any) => `  ${marker} ${extractTextFromNode(child)}`)
          .join("\n");
      }
      return "";
    }

    if (node.type === "listitem") {
      if (node.children && Array.isArray(node.children)) {
        return node.children.map(extractTextFromNode).join("");
      }
      return "";
    }

    return "";
  };

  return extractTextFromNode(json.root);
}

export default WorkflowDocumentationPanel;
