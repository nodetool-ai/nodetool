import React from "react";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import { CircularActionButton } from "../../ui_primitives";
import { useTheme } from "@mui/material/styles";

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
  const theme = useTheme();

  return (
    <CircularActionButton
      icon={<ArrowDownwardIcon />}
      onClick={onClick}
      tooltip="Scroll to bottom"
      position="absolute"
      bottom={12}
      left="50%"
      transform="translateX(-50%)"
      zIndex={theme.zIndex.appBar}
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
