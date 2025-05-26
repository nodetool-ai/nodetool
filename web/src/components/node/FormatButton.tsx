import { memo } from "react";
import type { CustomText } from "./CommentNode";
import Tooltip from "@mui/material/Tooltip";

interface FormatButtonProps {
  format: keyof Omit<CustomText, "text">;
  label: string;
  isActive: boolean;
  onToggle: (format: keyof Omit<CustomText, "text">, label: string) => void;
  tooltipText: string;
}

const FormatButton: React.FC<FormatButtonProps> = ({
  format,
  label,
  isActive,
  onToggle,
  tooltipText
}) => {
  return (
    <Tooltip title={tooltipText} placement="bottom">
      <button
        tabIndex={-1}
        className={`nodrag ${isActive ? "active" : ""}`}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onToggle(format, label);
        }}
      >
        {label}
      </button>
    </Tooltip>
  );
};

export default memo(FormatButton);
