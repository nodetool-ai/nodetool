/** @jsxImportSource @emotion/react */
import React, { memo, forwardRef, startTransition, useCallback } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Button } from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import { useNavigate } from "react-router-dom";

const styles = (theme: Theme) =>
  css({
    backgroundColor: theme.vars.palette.grey[900],
    color: theme.vars.palette.grey[100],
    "&:hover": {
      color: theme.vars.palette.grey[0],
      backgroundColor: theme.vars.palette.grey[800],
      boxShadow: `0 0 5px ${"var(--palette-primary-main)"}20`
    }
  });

const BackToDashboardButton = forwardRef<HTMLButtonElement>((props, ref) => {
  const navigate = useNavigate();
  const theme = useTheme();
  const handleClick = useCallback(() => {
    startTransition(() => {
      navigate("/dashboard");
    });
  }, [navigate]);
  return (
    <Button
      ref={ref}
      className="nav-button back-to-dashboard"
      onClick={handleClick}
      css={styles(theme)}
      startIcon={<DashboardIcon />}
      {...props}
    >
      Dashboard
    </Button>
  );
});

BackToDashboardButton.displayName = "BackToDashboardButton";

export default memo(BackToDashboardButton);
