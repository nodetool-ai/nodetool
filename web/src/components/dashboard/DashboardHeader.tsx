/** @jsxImportSource @emotion/react */
import React from "react";
import { Box } from "@mui/material";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

interface DashboardHeaderProps {
  children?: React.ReactNode;
}

const styles = (_theme: Theme) =>
  css({
    position: "absolute",
    height: "40px",
    top: 0,
    right: 0,
    zIndex: 10,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "flex-end",
    gap: "0.5rem"
  });

const DashboardHeader: React.FC<DashboardHeaderProps> = ({ children }) => {
  const theme = useTheme();
  return (
    <Box className="dashboard-header" css={styles(theme)}>
      {children}
    </Box>
  );
};

export default DashboardHeader;
