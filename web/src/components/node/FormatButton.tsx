import { memo } from "react";
import type { CustomText } from "./CommentNode";

interface FormatButtonProps {
  format: keyof Omit<CustomText, "text">;
  label: string;
  isActive: boolean;
  onToggle: (format: keyof Omit<CustomText, "text">, label: string) => void;
}

const FormatButton: React.FC<FormatButtonProps> = ({
  format,
  label,
  isActive,
  onToggle
}) => {
  return (
    <button
      tabIndex={-1}
      className={`nodrag ${isActive ? "active" : ""}`}
      onMouseDown={(event) => {
        event.preventDefault();
        onToggle(format, label);
      }}
    >
      {label}
    </button>
  );
};

export default memo(FormatButton);
