/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Typography, Box } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo } from "react";

interface PanelHeadlineProps {
  title: string;
  actions?: React.ReactNode;
}

const styles = (theme: Theme) =>
  css({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    padding: ".5em .5em .5em 0",

    ".headline-title": {
      fontSize: "1rem",
      fontWeight: 300,
      letterSpacing: "0.01em",
      lineHeight: "1.5em",
      color: theme.vars.palette.text.primary,
      textShadow: "0px 0px 1px #22222266",
      margin: 0
    },

    ".headline-actions": {
      display: "flex",
      alignItems: "center",
      gap: "4px"
    }
  });

const PanelHeadline: React.FC<PanelHeadlineProps> = ({ title, actions }) => {
  const theme = useTheme();

  return (
    <Box css={styles(theme)} className="panel-headline">
      <Typography variant="h6" component="span" className="headline-title">
        {title}
      </Typography>
      {actions && <Box className="headline-actions">{actions}</Box>}
    </Box>
  );
};

export default memo(PanelHeadline);
