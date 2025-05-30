/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { IconButton } from "@mui/material";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import { useTheme } from "@mui/material/styles";

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
    position: "absolute",
    bottom: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 10,
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    padding: 0,
    backgroundColor: theme.palette.c_gray3,
    color: theme.palette.c_white,
    transition: "opacity 0.4s ease",
    "&:hover": {
      backgroundColor: `${theme.palette.c_gray4} !important`
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