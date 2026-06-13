/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { FlexRow } from "../ui_primitives/FlexRow";
import { Text } from "../ui_primitives/Text";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo } from "react";

interface PanelHeadlineProps {
  title: string;
  actions?: React.ReactNode;
}

const styles = (theme: Theme) =>
  css({
    padding: ".35em 0 .35em 0",
    minHeight: "2.25em",
    boxSizing: "border-box",

    ".headline-actions .MuiIconButton-root": {
      padding: 2,
      "& svg": { fontSize: "var(--fontSizeNormal)" }
    },
    ".headline-title": {
      letterSpacing: "0.01em",
      lineHeight: "1.4em",
      color: theme.vars.palette.text.primary,
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
