/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useState, useEffect } from "react";
import { IconButton } from "@mui/material";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
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

  const buttonStyles = css({
    position: "fixed",
    bottom: "110px",
    left: leftPosition !== null ? `${leftPosition}px` : "50%",
    transform: "translateX(-50%)",
    zIndex: theme.zIndex.appBar,
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    padding: 0,
    backgroundColor: theme.vars.palette.grey[500],
    color: theme.vars.palette.grey[0],
    transition: "opacity 0.4s ease",
    "&:hover": {
      backgroundColor: `${theme.vars.palette.grey[400]} !important`
    },
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  });

  return (
    <IconButton
      css={buttonStyles}
      className="scroll-to-bottom-button"
      onClick={onClick}
      size="small"
      style={{
        opacity: isVisible ? 0.8 : 0,
        pointerEvents: isVisible ? "auto" : "none"
      }}
      disableRipple
    >
      <ArrowDownwardIcon />
    </IconButton>
  );
};
