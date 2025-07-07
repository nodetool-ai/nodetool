/** @jsxImportSource @emotion/react */
import React, { memo, forwardRef } from "react";
import { Button, css } from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import { useNavigate } from "react-router-dom";

const styles = (theme: Theme) =>
  css({
    width: "fit-content",
    backgroundColor: theme.palette.grey[900],
    "&:hover": {
      color: theme.palette.grey[0],
      boxShadow: `0 0 5px ${"var(--palette-primary-main)"}20`
    },
    ".back-to-dashboard": {
      width: "fit-content"
    }
  });

interface BackToDashboardButtonProps {
  title?: string;
}

const BackToDashboardButton = forwardRef<
  HTMLButtonElement,
  BackToDashboardButtonProps
>(({ title, ...props }, ref) => {
  const navigate = useNavigate();

  return (
    <Button
      ref={ref}
      className="nav-button back-to-dashboard"
      onClick={() => navigate("/dashboard")}
      css={styles}
      {...props}
    >
      <DashboardIcon sx={{ fontSize: "20px", marginRight: "4px" }} />
      <span>{title || "Dashboard"}</span>
    </Button>
  );
});

BackToDashboardButton.displayName = "BackToDashboardButton";

export default memo(BackToDashboardButton);
