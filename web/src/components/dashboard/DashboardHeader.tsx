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
  position: "absolute",
  top: "1rem",
  right: "2rem",
  zIndex: 10
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
