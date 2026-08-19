/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  DocsHelpLink,
  FlexRow,
  SPACING,
  Text,
  getSpacingPx
} from "../ui_primitives";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo } from "react";
import type { DocsTopic } from "../../config/docsLinks";

interface PanelHeadlineProps {
  title: string;
  actions?: React.ReactNode;
  /** Renders a help icon beside the title, linking to this docs page. */
  docsTopic?: DocsTopic;
  /** Short explanation shown in the documentation link tooltip. */
  description?: string;
}

const styles = (theme: Theme) =>
  css({
    padding: `${getSpacingPx(SPACING.sm)} 0`,
    minHeight: "2.25em",
    boxSizing: "border-box",

    ".headline-actions .MuiIconButton-root": {
      padding: getSpacingPx(SPACING.micro),
      "& svg": { fontSize: "var(--fontSizeNormal)" }
    },
    ".headline-titles .docs-help-link": {
      padding: getSpacingPx(SPACING.micro),
      "& svg": { fontSize: "var(--fontSizeSmall)" }
    },
    ".headline-title": {
      letterSpacing: "0.01em",
      lineHeight: "1.4em",
      color: theme.vars.palette.text.primary,
      margin: 0
    }
  });

const PanelHeadline: React.FC<PanelHeadlineProps> = ({
  title,
  actions,
  docsTopic,
  description
}) => {
  const theme = useTheme();

  return (
    <FlexRow
      css={styles(theme)}
      className="panel-headline"
      justify="space-between"
      align="center"
      fullWidth
    >
      <FlexRow className="headline-titles" align="center" gap={SPACING.none}>
        <Text
          size="normal"
          weight={600}
          component="span"
          className="headline-title"
        >
          {title}
        </Text>
        {docsTopic && (
          <DocsHelpLink
            topic={docsTopic}
            label={title}
            description={description}
          />
        )}
      </FlexRow>
      {actions && (
        <FlexRow
          className="headline-actions"
          align="center"
          gap={SPACING.micro}
        >
          {actions}
        </FlexRow>
      )}
    </FlexRow>
  );
};

export default memo(PanelHeadline);
