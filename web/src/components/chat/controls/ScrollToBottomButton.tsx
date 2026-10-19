import React from "react";
import { useTranslation } from "react-i18next";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import {
  CircularActionButton,
  SPACING_PX,
  Z_INDEX
} from "../../ui_primitives";

interface ScrollToBottomButtonProps {
  isVisible: boolean;
  onClick: () => void;
}

/**
 * Floats centered near the bottom of the thread viewport. Positioned
 * absolutely within the thread root (which is `position: relative`), so it
 * always sits above the composer instead of overlapping it.
 */
export const ScrollToBottomButton: React.FC<ScrollToBottomButtonProps> = ({
  isVisible,
  onClick
}) => {
  const { t } = useTranslation();
  return (
    <CircularActionButton
      icon={<ArrowDownwardIcon />}
      onClick={onClick}
      tooltip={t("i18n-next23.chat.actions.scrollToBottom")}
      position="absolute"
      bottom={SPACING_PX.lg}
      left="50%"
      transform="translateX(-50%)"
      zIndex={Z_INDEX.overlay}
      size={32}
      backgroundColor="grey.500"
      hoverBackgroundColor="grey.400"
      color="grey.0"
      isVisible={isVisible}
      opacity={isVisible ? 0.85 : 0}
      className="scroll-to-bottom-button"
    />
  );
};
