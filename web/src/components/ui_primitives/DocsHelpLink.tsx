/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import { IconButton, Tooltip } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { docsLink, type DocsTopic } from "../../config/docsLinks";
import { MOTION } from "./tokens";

export interface DocsHelpLinkProps {
  /** Documentation page this surface maps to. */
  topic: DocsTopic;
  /** What the tooltip names, e.g. "Workflows" → "Workflows documentation". */
  label: string;
  size?: "small" | "medium";
  tooltipPlacement?: "top" | "bottom" | "left" | "right";
  className?: string;
}

const styles = (theme: Theme) =>
  css({
    color: theme.vars.palette.text.disabled,
    transition: `color ${MOTION.normal}`,
    "&:hover": {
      color: theme.vars.palette.primary.main,
      backgroundColor: theme.vars.palette.action.hover
    }
  });

/**
 * Small help icon that opens the matching documentation page in a new tab.
 * Sits in panel headers and page heroes next to the thing it explains.
 */
const DocsHelpLinkInternal: React.FC<DocsHelpLinkProps> = ({
  topic,
  label,
  size = "small",
  tooltipPlacement = "bottom",
  className
}) => {
  const theme = useTheme();
  const title = `${label} documentation`;

  return (
    <Tooltip
      title={title}
      enterDelay={TOOLTIP_ENTER_DELAY}
      placement={tooltipPlacement}
    >
      <IconButton
        className={`docs-help-link nodrag${className ? ` ${className}` : ""}`}
        css={styles(theme)}
        size={size}
        component="a"
        href={docsLink(topic)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={title}
        tabIndex={-1}
        onClick={(event: React.MouseEvent) => event.stopPropagation()}
      >
        <HelpOutlineIcon fontSize={size === "medium" ? "medium" : "small"} />
      </IconButton>
    </Tooltip>
  );
};

export const DocsHelpLink = memo(DocsHelpLinkInternal);

DocsHelpLink.displayName = "DocsHelpLink";

export default DocsHelpLink;
