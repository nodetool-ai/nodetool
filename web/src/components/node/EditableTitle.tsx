import { memo, useCallback, useState } from "react";
import { useNodes } from "../../contexts/NodeContext";

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

  return (
    <div className="title-container" onDoubleClick={handleDoubleClick}>
      {isEditing ? (
        <textarea
          defaultValue={title}
          autoFocus
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onBlur={() => setIsEditing(false)}
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
