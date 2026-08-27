/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { IconButton, Tooltip } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { docsLink, type DocsTopic } from "../../config/docsLinks";
import { MOTION, reducedMotion } from "./tokens";

export interface DocsHelpLinkProps {
  /** Documentation page this surface maps to. */
  topic: DocsTopic;
  /** What the tooltip names, e.g. "Workflows" → "Workflows documentation". */
  label: string;
  /** Use a compact icon or an explicit external-link action. */
  variant?: "icon" | "label";
  size?: "small" | "medium";
  tooltipPlacement?: "top" | "bottom" | "left" | "right";
  className?: string;
}

const iconStyles = (theme: Theme) =>
  css({
    color: theme.vars.palette.text.disabled,
    transition: `color ${MOTION.normal}`,
    ...reducedMotion({ transition: MOTION.none }),
    "&:hover": {
      color: theme.vars.palette.primary.main,
      backgroundColor: theme.vars.palette.action.hover
    }
  });

const labelStyles = (theme: Theme) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: theme.vars.palette.text.disabled,
    lineHeight: 1,
    textDecoration: "none",
    whiteSpace: "nowrap",
    transition: `color ${MOTION.normal}`,
    ...reducedMotion({ transition: MOTION.none }),
    "&:hover": {
      color: theme.vars.palette.primary.main
    },
    "& .docs-help-link-icon": {
      fontSize: "var(--fontSizeSmall)"
    }
  });

/**
 * Opens the matching documentation page in a new tab, as either a compact
 * help icon or an explicit text action.
 */
const DocsHelpLinkInternal: React.FC<DocsHelpLinkProps> = ({
  topic,
  label,
  variant = "icon",
  size = "small",
  tooltipPlacement = "bottom",
  className
}) => {
  const theme = useTheme();
  const title = `${label} documentation`;

  const commonProps = {
    href: docsLink(topic),
    target: "_blank",
    rel: "noopener noreferrer",
    "aria-label": title,
    onClick: (event: React.MouseEvent) => event.stopPropagation()
  } as const;

  const link =
    variant === "label" ? (
      <a
        {...commonProps}
        className={`docs-help-link nodrag${className ? ` ${className}` : ""}`}
        css={labelStyles(theme)}
      >
        <OpenInNewIcon className="docs-help-link-icon" aria-hidden="true" />
      </a>
    ) : (
      <IconButton
        {...commonProps}
        className={`docs-help-link nodrag${className ? ` ${className}` : ""}`}
        css={iconStyles(theme)}
        size={size}
        component="a"
      >
        <HelpOutlineIcon fontSize={size === "medium" ? "medium" : "small"} />
      </IconButton>
    );

  return (
    <Tooltip
      title={title}
      enterDelay={TOOLTIP_ENTER_DELAY}
      placement={tooltipPlacement}
    >
      {link}
    </Tooltip>
  );
};

export const DocsHelpLink = memo(DocsHelpLinkInternal);

DocsHelpLink.displayName = "DocsHelpLink";

export default DocsHelpLink;
