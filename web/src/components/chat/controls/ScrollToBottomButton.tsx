import React, { useState, useEffect } from "react";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import { CircularActionButton } from "../../ui_primitives";
import { useTheme } from "@mui/material/styles";

interface ScrollToBottomButtonProps {
  isVisible: boolean;
  onClick: () => void;
  /** Optional container element to center the button within */
  containerElement?: HTMLElement | null;
}

export const ScrollToBottomButton: React.FC<ScrollToBottomButtonProps> = ({
  isVisible,
  onClick,
  containerElement
}) => {
  const theme = useTheme();
  const [leftPosition, setLeftPosition] = useState<number | null>(null);

  // Calculate center position based on container element
  useEffect(() => {
    if (!containerElement) {
      setLeftPosition(null);
      return;
    }

    const updatePosition = () => {
      const rect = containerElement.getBoundingClientRect();
      setLeftPosition(rect.left + rect.width / 2);
    };

    updatePosition();

    // Update on resize
    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(containerElement);

    window.addEventListener("resize", updatePosition);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updatePosition);
    };
  }, [containerElement]);

  return (
    <CircularActionButton
      icon={<ArrowDownwardIcon />}
      onClick={onClick}
      tooltip="Scroll to bottom"
      position="fixed"
      bottom={120}
      left={leftPosition !== null ? `${leftPosition}px` : "50%"}
      transform="translateX(-50%)"
      zIndex={theme.zIndex.appBar}
      size={32}
      backgroundColor="grey.500"
      hoverBackgroundColor="grey.400"
      color="grey.0"
      isVisible={isVisible}
      opacity={isVisible ? 0.7 : 0}
      className="scroll-to-bottom-button"
    />
  );
};
