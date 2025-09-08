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
    borderTop: `1px solid ${theme.vars.palette.grey[600]}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    height: 25,
    padding: "0 8px",

    ".count-pill": {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      fontSize: theme.vars.fontSizeSmall,
      marginTop: 15,
      padding: "2px 8px",
      borderRadius: 6,
      backgroundColor: theme.vars.palette.grey[800],
      color: theme.vars.palette.grey[0]
    },

    ".count-pill .value": {
      color: "var(--palette-primary-main)",
      fontWeight: 500
    },

    ".count-pill .label": {
      color: theme.vars.palette.text.secondary,
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
            ? `Showing ${filteredCount} of ${totalActiveCount} active models (${totalCount} total)`
            : `Showing ${filteredCount} of ${totalCount} total models`
        }
        placement="top"
      >
        <Typography
          component="div"
          className="count-pill"
          aria-label="model counts"
        >
          <span className="value">{filteredCount}</span>
          <span className="label"> shown</span>
          {totalActiveCount !== undefined ? (
            <>
              <span className="label"> · </span>
              <span className="value">{totalActiveCount}</span>
              <span className="label"> active</span>
              <span className="label"> · </span>
              <span className="value">{totalCount}</span>
              <span className="label"> total</span>
            </>
          ) : (
            <>
              <span className="label"> · </span>
              <span className="value">{totalCount}</span>
              <span className="label"> total</span>
            </>
          )}
        </Typography>
      </Tooltip>
    </Box>
  );
};

export default ModelMenuFooter;
