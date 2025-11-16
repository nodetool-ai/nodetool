/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { IconButton } from "@mui/material";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

interface ScrollToBottomButtonProps {
  isVisible: boolean;
  onClick: () => void;
}

export const ScrollToBottomButton: React.FC<ScrollToBottomButtonProps> = ({
  isVisible,
  onClick
}) => {
  const theme = useTheme();

  const buttonStyles = css({
    position: "fixed",
    bottom: "110px",
    left: "50%",
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
