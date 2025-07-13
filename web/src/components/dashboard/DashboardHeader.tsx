/** @jsxImportSource @emotion/react */
import React from "react";
import { Box } from "@mui/material";
import { css } from "@emotion/react";
import BackToEditorButton from "../panels/BackToEditorButton";

interface DashboardHeaderProps {
  showBackToEditor: boolean;
  children?: React.ReactNode;
}

const styles = css({
  height: "2rem",
  width: "100%",
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  padding: "0 1rem"
});

const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  showBackToEditor,
  children
}) => {
  return (
    <Box css={styles}>
      {children}
      {showBackToEditor && <BackToEditorButton />}
    </Box>
  );
};

export default DashboardHeader;
