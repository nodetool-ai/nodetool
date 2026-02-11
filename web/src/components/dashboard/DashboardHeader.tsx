/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { FlexRow } from "../ui_primitives";

interface DashboardHeaderProps {
  children?: React.ReactNode;
}

const styles = (_theme: Theme) =>
  css({
    position: "absolute",
    height: "40px",
    top: 0,
    right: 0,
    zIndex: 10
  });

const DashboardHeader: React.FC<DashboardHeaderProps> = memo(({ children }) => {
  const theme = useTheme();
  return (
    <FlexRow className="dashboard-header" gap={2} align="flex-start" justify="flex-end" css={styles(theme)}>
      {children}
    </FlexRow>
  );
});

DashboardHeader.displayName = 'DashboardHeader';

export default DashboardHeader;
