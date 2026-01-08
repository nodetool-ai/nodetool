/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useState } from "react";
import { useNodes } from "../../contexts/NodeContext";
import { useTheme } from "@mui/material/styles";

interface EditableTitleProps {
  nodeId: string;
  title: string;
}

const EditableTitle = memo(function EditableTitle({
  nodeId,
  title
}: EditableTitleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const updateNodeData = useNodes((state) => state.updateNodeData);
  const theme = useTheme();

  const styles = css({
    position: "absolute",
    top: "100%",
    left: 0,
    width: "100%",
    minHeight: "3em",
    borderRadius: "0em 0em 0.3em 0.3em",
    background: "rgba(0, 0, 0, 0.8)",
    backdropFilter: "blur(10px)",
    display: "flex",
    flexDirection: "column",
    padding: "1em",
    gap: 0,
    border: `1px solid ${theme.vars.palette.grey[800]}`,
    zIndex: 10,

    "& textarea": {
      width: "100%",
      height: "100%",
      border: "none",
      outline: "none",
      resize: "none",
      fontSize: "var(--fontSizeNormal)",
      lineHeight: "1.1em",
      fontWeight: 400,
      color: "var(--palette-grey-0)",
      backgroundColor: "transparent"
    },

    "&:hover .remove-title": {
      display: "block"
    },

    ".remove-title": {
      display: "none",
      position: "absolute",
      right: "4px",
      top: "4px",
      color: "var(--palette-grey-400)",
      backgroundColor: "transparent",
      border: "none",
      cursor: "pointer",
      padding: "4px",
      margin: 0,
      fontSize: "12px",
      "&:hover": {
        color: "var(--palette-error-main)"
      }
    },

    ".title": {
      pointerEvents: "none",
      padding: "1em",
      bottom: 0,
      width: "100%",
      color: "var(--palette-grey-0)",
      fontSize: "var(--fontSizeNormal)",
      lineHeight: "1.1em",
      fontWeight: 400
    }
  });

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      e.currentTarget.style.height = "auto";
      e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;

      if (e.key === "Enter" && !e.shiftKey) {
        updateNodeData(nodeId, { title: e.currentTarget.value });
        setIsEditing(false);
      } else if (e.key === "Escape") {
        setIsEditing(false);
      }
    },
    [nodeId, updateNodeData]
  );

  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    e.currentTarget.style.height = "auto";
    e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
  }, []);

  const handleRemoveTitle = useCallback(() => {
    updateNodeData(nodeId, { title: "" });
  }, [nodeId, updateNodeData]);

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      updateNodeData(nodeId, { title: e.currentTarget.value });
      setIsEditing(false);
    },
    [nodeId, updateNodeData]
  );

  return (
    <div
      className="title-container"
      css={styles}
      onDoubleClick={handleDoubleClick}
    >
      {isEditing ? (
        <textarea
          defaultValue={title}
          autoFocus
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onBlur={handleBlur}
          style={{ overflow: "hidden", resize: "none" }}
        />
      ) : (
        <>
          <div className="title">{title}</div>
          <button
            className="remove-title"
            onClick={handleRemoveTitle}
            title="Remove comment"
          >
            x
          </button>
        </>
      )}
    </div>
  );
});

export default EditableTitle;
