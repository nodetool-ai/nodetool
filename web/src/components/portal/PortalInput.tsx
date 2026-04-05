/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, useCallback, useRef, useState } from "react";
import { IconButton } from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";

const styles = (theme: Theme) =>
  css({
    width: "100%",
    maxWidth: 440,
    margin: "0 auto",
    background: theme.vars.palette.action.hover,
    border: `1px solid ${theme.vars.palette.action.focus}`,
    borderRadius: 12,
    padding: "14px 16px",
    display: "flex",
    alignItems: "flex-end",
    gap: 10,
    transition: "border-color 0.2s ease",
    "&:focus-within": {
      borderColor: theme.vars.palette.action.disabled,
    },
    ".portal-input-textarea": {
      flex: 1,
      background: "transparent",
      border: "none",
      outline: "none",
      color: theme.vars.palette.c_white,
      fontSize: 14,
      fontFamily: "inherit",
      resize: "none" as const,
      lineHeight: 1.5,
      maxHeight: 120,
      overflowY: "auto" as const,
      "&::placeholder": {
        color: theme.vars.palette.c_gray4,
      },
    },
    ".portal-input-send": {
      width: 28,
      height: 28,
      minWidth: 28,
      backgroundColor: theme.palette.primary.main,
      borderRadius: "50%",
      color: "white",
      "&:hover": {
        backgroundColor: theme.palette.primary.dark,
      },
      "&.Mui-disabled": {
        backgroundColor: theme.vars.palette.c_gray3,
        color: theme.vars.palette.c_gray5,
      },
    },
  });

type PortalInputProps = {
  onSend: (text: string) => void;
  onSearchChange?: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

const PortalInput: React.FC<PortalInputProps> = ({
  onSend,
  onSearchChange,
  placeholder = "Type here...",
  disabled = false,
}) => {
  const theme = useTheme();
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) {return;}
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setValue(val);
      // Auto-resize
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      }
      onSearchChange?.(val);
    },
    [onSearchChange]
  );

  return (
    <div css={styles(theme)}>
      <textarea
        ref={textareaRef}
        className="portal-input-textarea"
        rows={1}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        autoFocus
      />
      <IconButton
        className="portal-input-send"
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        size="small"
      >
        <ArrowUpwardIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </div>
  );
};

export default memo(PortalInput);
