/** @jsxImportSource @emotion/react */
import styled from "@emotion/styled";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useNodes } from "../../contexts/NodeContext";
import { useTheme } from "@mui/material/styles";
import { IconButton, Tooltip } from "@mui/material";
import CollapseIcon from "@mui/icons-material/UnfoldLess";
import ExpandIcon from "@mui/icons-material/UnfoldMore";
import CloseIcon from "@mui/icons-material/Close";

interface CommentEditorProps {
  nodeId: string;
  comment: string;
  isCollapsed: boolean;
  onCollapseChange: (collapsed: boolean) => void;
}

const CommentContainer = styled.div<{ isCollapsed: boolean; displayHeight: number }>`
  position: relative;
  width: 100%;
  min-height: ${(props) => (props.isCollapsed ? "2em" : `${props.displayHeight}px`)};
  max-height: ${(props) => (props.isCollapsed ? "2em" : "200px")};
  border-radius: 0em 0em 0.3em 0.3em;
  background: ${(props) => props.theme.vars.palette.c_bg_comment || "rgba(250, 247, 242, 0.95)"};
  backdrop-filter: blur(10px);
  display: flex;
  flex-direction: column;
  padding: ${(props) => (props.isCollapsed ? "0.5em" : "0.75em")};
  gap: 0;
  border: 1px solid ${(props) => props.theme.vars.palette.divider};
  border-top: none;
  z-index: 10;
  transition: all 0.2s ease-in-out;
  color: ${(props) => props.theme.vars.palette.text.primary};

  @media (prefers-color-scheme: dark) {
    background: ${(props) => props.theme.vars.palette.c_bg_comment || "rgba(15, 17, 21, 0.95)"};
  }

  &:hover .comment-actions {
    opacity: 1;
  }
`;

const CommentTextArea = styled.textarea<{ isEditing: boolean; editHeight: number }>`
  width: 100%;
  height: ${(props) => (props.isEditing ? `${props.editHeight}px` : "100%")};
  min-height: 60px;
  max-height: 300px;
  border: none;
  outline: none;
  resize: none;
  font-size: var(--fontSizeSmall);
  line-height: 1.4em;
  font-weight: 400;
  color: ${(props) => props.theme.vars.palette.text.primary};
  background-color: transparent;
  font-family: inherit;
  padding: 0;

  &::placeholder {
    color: ${(props) => props.theme.vars.palette.text.secondary};
    opacity: 0.7;
  }
`;

const CommentText = styled.div`
  padding: 0.5em;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: var(--fontSizeSmall);
  line-height: 1.4em;
  color: ${(props) => props.theme.vars.palette.text.primary};
  min-height: 2em;
  display: flex;
  align-items: center;
`;

const CollapsedIndicator = styled.div`
  padding: 0.5em;
  font-size: var(--fontSizeSmall);
  color: ${(props) => props.theme.vars.palette.text.secondary};
  font-style: italic;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const CommentActions = styled.div`
  position: absolute;
  right: 4px;
  top: 4px;
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s;
  background-color: ${(props) => props.theme.vars.palette.background.paper};
  border-radius: 4px;
  padding: 2px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
`;

const CommentIconButton = styled(IconButton)`
  width: 24px;
  height: 24px;
  min-width: 24px;
  padding: 2px;
  color: ${(props) => props.theme.vars.palette.text.secondary};

  &:hover {
    color: ${(props) => props.theme.vars.palette.text.primary};
    background-color: ${(props) => props.theme.vars.palette.action.hover};
  }
`;

const CommentEditor = memo(function CommentEditor({
  nodeId,
  comment,
  isCollapsed,
  onCollapseChange
}: CommentEditorProps) {
  const theme = useTheme();
  const updateNodeData = useNodes((state) => state.updateNodeData);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [localComment, setLocalComment] = useState(comment);

  useEffect(() => {
    setLocalComment(comment);
  }, [comment]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length
      );
    }
  }, [isEditing]);

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      e.stopPropagation();

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        updateNodeData(nodeId, { comment: localComment });
        setIsEditing(false);
      } else if (e.key === "Escape") {
        setLocalComment(comment);
        setIsEditing(false);
      } else if (e.key === "Tab") {
        e.preventDefault();
        const target = e.currentTarget;
        const start = target.selectionStart;
        const end = target.selectionEnd;
        target.value = target.value.substring(0, start) + "  " + target.value.substring(end);
        target.selectionStart = target.selectionEnd = start + 2;
        setLocalComment(target.value);
      }
    },
    [comment, localComment, nodeId, updateNodeData]
  );

  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    target.style.height = "auto";
    const newHeight = Math.min(target.scrollHeight, 300);
    target.style.height = `${newHeight}px`;
    setLocalComment(target.value);
  }, []);

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      updateNodeData(nodeId, { comment: e.currentTarget.value });
      setIsEditing(false);
    },
    [nodeId, updateNodeData]
  );

  const handleRemoveComment = useCallback(() => {
    updateNodeData(nodeId, { comment: "", commentCollapsed: false });
  }, [nodeId, updateNodeData]);

  const handleToggleCollapse = useCallback(() => {
    const newCollapsed = !isCollapsed;
    updateNodeData(nodeId, { commentCollapsed: newCollapsed });
    onCollapseChange(newCollapsed);
  }, [isCollapsed, nodeId, onCollapseChange, updateNodeData]);

  const lineCount = comment.split("\n").length;
  const displayHeight = Math.min(Math.max(lineCount * 20 + 20, 60), 200);
  const editHeight = Math.min(Math.max(localComment.split("\n").length * 20 + 20, 60), 300);

  if (isCollapsed) {
    return (
      <CommentContainer isCollapsed={isCollapsed} displayHeight={displayHeight} onDoubleClick={handleToggleCollapse}>
        <CollapsedIndicator>{comment ? comment : "Add a comment..."}</CollapsedIndicator>
        <CommentActions>
          <Tooltip title="Expand comment" arrow>
            <CommentIconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleCollapse();
              }}
            >
              <ExpandIcon fontSize="small" />
            </CommentIconButton>
          </Tooltip>
          {comment && (
            <Tooltip title="Remove comment" arrow>
              <CommentIconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveComment();
                }}
              >
                <CloseIcon fontSize="small" />
              </CommentIconButton>
            </Tooltip>
          )}
        </CommentActions>
      </CommentContainer>
    );
  }

  return (
    <CommentContainer isCollapsed={isCollapsed} displayHeight={displayHeight} onDoubleClick={handleDoubleClick}>
      {isEditing ? (
        <CommentTextArea
          ref={textareaRef}
          isEditing={isEditing}
          editHeight={editHeight}
          defaultValue={localComment}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onBlur={handleBlur}
          placeholder="Add a comment... (Enter to save, Shift+Enter for new line, Escape to cancel)"
          style={{ overflow: "hidden", resize: "none" }}
        />
      ) : (
        <>
          <CommentText>
            {comment || (
              <span style={{ color: theme.vars.palette.text.secondary, fontStyle: "italic" }}>
                Add a comment...
              </span>
            )}
          </CommentText>
          <CommentActions>
            <Tooltip title="Collapse" arrow>
              <CommentIconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleCollapse();
                }}
              >
                <CollapseIcon fontSize="small" />
              </CommentIconButton>
            </Tooltip>
            {comment && (
              <Tooltip title="Remove comment" arrow>
                <CommentIconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveComment();
                  }}
                >
                  <CloseIcon fontSize="small" />
                </CommentIconButton>
              </Tooltip>
            )}
          </CommentActions>
        </>
      )}
    </CommentContainer>
  );
});

export default CommentEditor;
