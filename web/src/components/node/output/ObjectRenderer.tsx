/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, Typography } from "@mui/material";
import isEqual from "lodash/isEqual";

const objectStyles = (theme: Theme) =>
  css({
    "&": {
      width: "100%",
      display: "flex",
      flexDirection: "column",
      gap: "0.5em"
    },
    ".object-entry": {
      display: "flex",
      flexDirection: "column",
      gap: "0.25em",
      padding: "0.5em",
      borderRadius: "6px",
      backgroundColor: theme.vars.palette.action.hover,
      "&:last-child": {
        marginBottom: 0
      }
    },
    ".object-key": {
      fontSize: theme.vars.fontSizeSmaller,
      fontWeight: 600,
      color: theme.vars.palette.primary.main,
      textTransform: "capitalize",
      letterSpacing: "0.02em"
    },
    ".object-value": {
      width: "100%"
    }
  });

interface ObjectRendererProps {
  value: Record<string, any>;
  renderValue: (value: any, key: string) => React.ReactNode;
}

/**
 * ObjectRenderer displays a multi-key object with each value
 * rendered using the provided render function.
 * Provides a clean, organized display of object properties.
 */
const ObjectRenderer: React.FC<ObjectRendererProps> = ({
  value,
  renderValue
}) => {
  const theme = useTheme();
  const entries = Object.entries(value);

  if (entries.length === 0) {
    return null;
  }

  // For single-key objects, render the value directly without the wrapper
  if (entries.length === 1) {
    const [key, val] = entries[0];
    return <>{renderValue(val, key)}</>;
  }

  return (
    <Box css={objectStyles(theme)} className="object-renderer nodrag">
      {entries.map(([key, val]) => (
        <Box key={key} className="object-entry">
          <Typography className="object-key" component="span">
            {key.replace(/_/g, " ")}
          </Typography>
          <Box className="object-value">{renderValue(val, key)}</Box>
        </Box>
      ))}
    </Box>
  );
};

export default memo(ObjectRenderer, isEqual);
