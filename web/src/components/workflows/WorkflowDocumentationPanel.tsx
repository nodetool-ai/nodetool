/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useState, useCallback, memo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, Tooltip, IconButton } from "@mui/material";
import {
  EditOutlined,
  SaveOutlined,
  CancelOutlined
} from "@mui/icons-material";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import MarkdownRenderer from "../../utils/MarkdownRenderer";
import {
  useWorkflowDocumentationStore
} from "../../stores/WorkflowDocumentationStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

const styles = (theme: Theme) =>
  css({
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    ".documentation-header": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: theme.spacing(1, 2),
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      ".header-title": {
        fontSize: "1.1rem",
        fontWeight: 500,
        color: theme.vars.palette.text.primary
      },
      ".header-actions": {
        display: "flex",
        gap: theme.spacing(0.5)
      }
    },
    ".documentation-content": {
      flex: 1,
      overflow: "auto",
      padding: theme.spacing(2),
      "& .markdown-content": {
        fontSize: theme.vars.fontSizeBig,
        lineHeight: 1.6
      }
    },
    ".documentation-editor": {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      padding: theme.spacing(2),
      "& .editor-textarea": {
        flex: 1,
        fontFamily: "monospace",
        fontSize: theme.vars.fontSizeBig,
        lineHeight: 1.6,
        border: `1px solid ${theme.vars.palette.divider}`,
        borderRadius: theme.spacing(0.5),
        padding: theme.spacing(1),
        resize: "none",
        "&:focus": {
          outline: `2px solid ${theme.vars.palette.primary.main}`,
          outlineOffset: "-2px"
        }
      }
    },
    ".empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      color: theme.vars.palette.text.secondary,
      textAlign: "center",
      padding: theme.spacing(4),
      ".empty-icon": {
        fontSize: "4rem",
        marginBottom: theme.spacing(2),
        opacity: 0.5
      },
      ".empty-text": {
        fontSize: "1.1rem",
        marginBottom: theme.spacing(1)
      },
      ".empty-hint": {
        fontSize: "0.9rem",
        opacity: 0.7
      }
    }
  });

interface WorkflowDocumentationPanelProps {
  workflowId: string;
}

const WorkflowDocumentationPanel: React.FC<WorkflowDocumentationPanelProps> =
  memo(function WorkflowDocumentationPanel({ workflowId }) {
    const theme = useTheme();
    useWorkflowManager((state) => state.currentWorkflowId);

    const documentation = useWorkflowDocumentationStore(
      (state) => state.documentation[workflowId]
    );
    const setDocumentation = useWorkflowDocumentationStore(
      (state) => state.setDocumentation
    );
    const isEditing = useWorkflowDocumentationStore(
      (state) => state.isEditing && state.currentWorkflowId === workflowId
    );
    const setIsEditing = useWorkflowDocumentationStore(
      (state) => state.setIsEditing
    );
    const setCurrentWorkflowId = useWorkflowDocumentationStore(
      (state) => state.setCurrentWorkflowId
    );

    const [editorContent, setEditorContent] = useState(
      documentation?.content || ""
    );

    const handleEditClick = useCallback(() => {
      setEditorContent(documentation?.content || "");
      setCurrentWorkflowId(workflowId);
      setIsEditing(true);
    }, [documentation?.content, workflowId, setCurrentWorkflowId, setIsEditing]);

    const handleCancelClick = useCallback(() => {
      setEditorContent(documentation?.content || "");
      setIsEditing(false);
      setCurrentWorkflowId(null);
    }, [documentation?.content, setIsEditing, setCurrentWorkflowId]);

    const handleSaveClick = useCallback(() => {
      setDocumentation(workflowId, editorContent);
      setIsEditing(false);
      setCurrentWorkflowId(null);
    }, [editorContent, workflowId, setDocumentation, setIsEditing, setCurrentWorkflowId]);

    const handleEditorChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setEditorContent(e.target.value);
      },
      []
    );

    return (
      <Box css={styles(theme)} className="workflow-documentation-panel">
        {/* Header */}
        <div className="documentation-header">
          <span className="header-title">Documentation</span>
          <div className="header-actions">
            {isEditing ? (
              <>
                <Tooltip
                  title="Save (Ctrl+S)"
                  placement="top"
                  enterDelay={TOOLTIP_ENTER_DELAY}
                >
                  <IconButton
                    size="small"
                    onClick={handleSaveClick}
                    aria-label="Save documentation"
                  >
                    <SaveOutlined fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip
                  title="Cancel (Esc)"
                  placement="top"
                  enterDelay={TOOLTIP_ENTER_DELAY}
                >
                  <IconButton
                    size="small"
                    onClick={handleCancelClick}
                    aria-label="Cancel editing"
                  >
                    <CancelOutlined fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            ) : (
              <Tooltip
                title="Edit documentation"
                placement="top"
                enterDelay={TOOLTIP_ENTER_DELAY}
              >
                <IconButton
                  size="small"
                  onClick={handleEditClick}
                  aria-label="Edit documentation"
                >
                  <EditOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="documentation-content">
          {isEditing ? (
            <div className="documentation-editor">
              <textarea
                className="editor-textarea"
                value={editorContent}
                onChange={handleEditorChange}
                placeholder="# Workflow Documentation

Add documentation for your workflow using **Markdown**.

## Examples:
- **Bold text**
- *Italic text*
- `code`
- [Links](https://example.com)

## Lists:
1. First item
2. Second item

## Code blocks:
\`\`\`javascript
console.log('Hello World');
\`\`\`
"
                aria-label="Edit documentation"
                autoFocus
              />
            </div>
          ) : documentation?.content ? (
            <div className="markdown-content">
              <MarkdownRenderer content={documentation.content} />
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📝</div>
              <div className="empty-text">No documentation yet</div>
              <div className="empty-hint">
                Click the edit button to add documentation for this workflow
              </div>
            </div>
          )}
        </div>
      </Box>
    );
  });

export default WorkflowDocumentationPanel;
