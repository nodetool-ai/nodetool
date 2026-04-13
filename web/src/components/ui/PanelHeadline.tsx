/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { FlexRow, Text } from "../ui_primitives";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo } from "react";

interface PanelHeadlineProps {
  title: string;
  actions?: React.ReactNode;
}

const styles = (theme: Theme) =>
  css({
    padding: ".5em .5em .5em 0",

    ".headline-title": {
      fontSize: "1rem",
      fontWeight: 300,
      letterSpacing: "0.01em",
      lineHeight: "1.5em",
      color: theme.vars.palette.text.primary,
      textShadow: `0px 0px 1px ${theme.vars.palette.common.black}${Math.round(0.4 * 255).toString(16).padStart(2, "0")}`,
      margin: 0
    }
  });

const PanelHeadline: React.FC<PanelHeadlineProps> = ({ title, actions }) => {
  const theme = useTheme();

  return (
    <FlexRow
      css={styles(theme)}
      className="panel-headline"
      justify="space-between"
      align="center"
      fullWidth
    >
      <Text
        size="normal"
        weight={600}
        component="span"
        className="headline-title"
      >
        {title}
      </Text>
      {actions && (
        <FlexRow className="headline-actions" align="center" gap={0.5}>
          {actions}
        </FlexRow>
      )}
    </FlexRow>
  );
};

export default memo(PanelHeadline);
