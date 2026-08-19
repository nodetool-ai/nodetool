/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  DocsHelpLink,
  FlexRow,
  SPACING,
  Text,
  Tooltip,
  getSpacingPx
} from "../ui_primitives";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo } from "react";
import type { DocsTopic } from "../../config/docsLinks";

interface PanelHeadlineProps {
  title: string;
  actions?: React.ReactNode;
  /** Renders a documentation link beside the title. */
  docsTopic?: DocsTopic;
  /** Short explanation shown when the title is hovered. */
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
      margin: 0,
      cursor: "default"
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
      <FlexRow className="headline-titles" align="center" gap={SPACING.md}>
        <Tooltip
          title={description ?? ""}
          disabled={!description}
          placement="bottom-start"
        >
          <Text
            size="normal"
            weight={600}
            component="span"
            className="headline-title"
          >
            {title}
          </Text>
        </Tooltip>
        {docsTopic && (
          <DocsHelpLink
            topic={docsTopic}
            label={title}
            variant="label"
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
