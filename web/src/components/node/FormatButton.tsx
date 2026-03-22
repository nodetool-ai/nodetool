import { memo, useCallback } from "react";
import type { CustomText } from "./CommentNode";
import Tooltip from "@mui/material/Tooltip";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

type MarkFormat = keyof Omit<CustomText, "text">;

interface FormatButtonProps {
  format?: MarkFormat;
  actionId?: string;
  label: string;
  isActive: boolean;
  onToggle?: (format: MarkFormat, label: string) => void;
  onAction?: () => void;
  tooltipText: string;
}

const FormatButton: React.FC<FormatButtonProps> = ({
  format,
  actionId,
  label,
  isActive,
  onToggle,
  onAction,
  tooltipText
}) => {
  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (actionId && onAction) {
      onAction();
    } else if (format && onToggle) {
      onToggle(format, label);
    }
  }, [actionId, onAction, format, onToggle, label]);

  return (
    <Tooltip
      title={tooltipText}
      placement="bottom"
      enterDelay={TOOLTIP_ENTER_DELAY * 4}
      enterNextDelay={TOOLTIP_ENTER_DELAY * 4}
    >
      <button
        tabIndex={-1}
        className={`nodrag ${isActive ? "active" : ""}`}
        onMouseDown={handleMouseDown}
      >
        {label}
      </button>
    </Tooltip>
  );
};

export default memo(FormatButton);
