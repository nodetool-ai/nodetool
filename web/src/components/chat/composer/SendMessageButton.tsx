import type { Ref } from "react";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import { ToolbarIconButton, MOTION } from "../../ui_primitives";

interface SendMessageButtonProps {
  disabled?: boolean;
  onClick: () => void;
  hasContent?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function SendMessageButton({
  disabled = false,
  onClick,
  hasContent = true,
  ref
}: SendMessageButtonProps) {
  const isDisabled = disabled || !hasContent;
  return (
    <ToolbarIconButton
      ref={ref}
      icon={<SendRoundedIcon fontSize="small" />}
      tooltip="Send message"
      onClick={onClick}
      disabled={isDisabled}
      nodrag={false}
      sx={(theme) => ({
        width: 36,
        height: 36,
        transition: `${MOTION.background}, ${MOTION.transform}`,
        boxShadow: "none",
        color: isDisabled
          ? theme.vars.palette.grey[500]
          : theme.vars.palette.grey[0],
        "&:hover": {
          backgroundColor: theme.vars.palette.grey[600]
        },
        "&:active": {
          transform: "translateY(1px)"
        },
        "&:disabled": {
          opacity: 0.5
        }
      })}
    />
  );
}
