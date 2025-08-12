/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";

export interface ModelMenuFooterProps {
  filteredCount: number;
  totalCount: number;
  totalActiveCount?: number; // enabled + available
}

const footerStyles = (theme: any) =>
  css({
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    height: 40,
    padding: "0 8px",

    ".count-pill": {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      fontSize: theme.vars.fontSizeSmall,
      padding: "2px 8px",
      borderRadius: 6,
      backgroundColor: theme.vars.palette.grey[600],
      color: theme.vars.palette.grey[0]
    },

    ".count-pill .value": {
      color: "var(--palette-primary-main)",
      fontWeight: 500
    },

    ".count-pill .label": {
      color: theme.vars.palette.grey[400],
      fontSize: theme.vars.fontSizeSmaller,
      letterSpacing: 0.2
    }
  });

const ModelMenuFooter: React.FC<ModelMenuFooterProps> = ({
  filteredCount,
  totalCount,
  totalActiveCount
}) => {
  const theme = useTheme();
  return (
    <Box css={footerStyles(theme)} className="model-menu__footer">
      <Tooltip
        title={
          totalActiveCount !== undefined
            ? `${filteredCount} / ${totalActiveCount} active / ${totalCount} models`
            : `${filteredCount} / ${totalCount} models`
        }
        placement="top"
      >
        <Typography component="div" className="count-pill">
          <span className="value">{filteredCount}</span>
          {totalActiveCount !== undefined ? (
            <>
              <span className="label">/ {totalActiveCount} active</span>
              <span className="label">/ {totalCount} models</span>
            </>
          ) : (
            <span className="label">/ {totalCount} models</span>
          )}
        </Typography>
      </Tooltip>
    </Box>
  );
};

export default ModelMenuFooter;
