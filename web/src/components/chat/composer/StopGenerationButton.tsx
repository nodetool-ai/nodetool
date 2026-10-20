import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import StopIcon from "@mui/icons-material/Stop";
import { ToolbarIconButton, BORDER_RADIUS, MOTION } from "../../ui_primitives";
import { SEND_BUTTON_SIZE } from "./MediaChatComposer.styles";

interface StopGenerationButtonProps {
  onClick: () => void;
  ref?: Ref<HTMLButtonElement>;
}

export function StopGenerationButton({
  onClick,
  ref
}: StopGenerationButtonProps) {
  const { t } = useTranslation();
  return (
    <ToolbarIconButton
      ref={ref}
      icon={<StopIcon fontSize="small" />}
      tooltip={t("i18n-next22.chat.composer.stopGeneration")}
      onClick={onClick}
      nodrag={false}
      sx={(theme) => ({
        width: SEND_BUTTON_SIZE,
        height: SEND_BUTTON_SIZE,
        padding: 0,
        borderRadius: BORDER_RADIUS.circle,
        backgroundColor: theme.vars.palette.grey[600],
        color: theme.vars.palette.text.primary,
        transition: `${MOTION.background}, ${MOTION.transform}`,
        boxShadow: "none",
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
