import type { PermissionMode } from "../../lib/chat-socket.js";

interface PermissionModePickerProps {
  value: PermissionMode;
  onChange: (mode: PermissionMode) => void;
}

export function PermissionModePicker({
  value,
  onChange
}: PermissionModePickerProps) {
  return (
    <label className="permission-picker" title="Tool permission mode">
      <span className="sr-only">Tool permissions</span>
      <select
        className="permission-picker__select"
        value={value}
        aria-label="Tool permissions"
        onChange={(event) => {
          const mode = readPermissionMode(event.target.value);
          if (mode) onChange(mode);
        }}
      >
        <option value="default">Ask</option>
        <option value="auto">Auto</option>
        <option value="plan">Plan</option>
      </select>
    </label>
  );
}

function readPermissionMode(value: string): PermissionMode | null {
  if (value === "default" || value === "auto" || value === "plan") {
    return value;
  }
  return null;
}
