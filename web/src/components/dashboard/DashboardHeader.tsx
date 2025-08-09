/** @jsxImportSource @emotion/react */
import React from "react";
import { Box } from "@mui/material";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import BackToEditorButton from "../panels/BackToEditorButton";

interface DashboardHeaderProps {
  showBackToEditor: boolean;
  children?: React.ReactNode;
}

const styles = (theme: Theme) =>
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

const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  showBackToEditor,
  children
}) => {
  const theme = useTheme();
  return (
    <Box className="dashboard-header" css={styles(theme)}>
      {children}
      {showBackToEditor && <BackToEditorButton />}
    </Box>
  );
};

export default DashboardHeader;
