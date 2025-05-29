/** @jsxImportSource @emotion/react */
import React, { memo, forwardRef } from "react";
import { Button, css } from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import { useNavigate } from "react-router-dom";

const styles = (theme: any) =>
  css({
    backgroundColor: theme.palette.c_gray0,
    color: theme.palette.c_gray6,
    "&:hover": {
      color: theme.palette.c_white,
      backgroundColor: theme.palette.c_gray1,
      boxShadow: `0 0 20px ${theme.palette.c_hl1}50`
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