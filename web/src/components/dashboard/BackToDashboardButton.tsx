/** @jsxImportSource @emotion/react */
import React, { memo, forwardRef } from "react";
import { Button, css } from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import { useNavigate } from "react-router-dom";

const styles = (theme: Theme) =>
  css({
    backgroundColor: theme.palette.grey[900],
    color: theme.palette.grey[100],
    "&:hover": {
      color: theme.palette.grey[0],
      backgroundColor: theme.palette.grey[800],
      boxShadow: `0 0 5px ${"var(--palette-primary-main)"}20`
    }
  });

const BackToDashboardButton = forwardRef<HTMLButtonElement>((props, ref) => {
  const navigate = useNavigate();

  return (
    <Button
      ref={ref}
      className="nav-button back-to-dashboard"
      onClick={() => navigate("/dashboard")}
      css={styles}
      startIcon={<DashboardIcon />}
      {...props}
    >
      Dashboard
    </Button>
  );
});

BackToDashboardButton.displayName = "BackToDashboardButton";

export default memo(BackToDashboardButton);
