/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Tooltip } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import NorthEastIcon from "@mui/icons-material/NorthEast";
import LaunchIcon from "@mui/icons-material/Launch";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const styles = (theme: Theme) =>
  css({
    color: theme.vars.palette.primary.main,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: theme.spacing(0.5),
    transition: "color 0.2s ease",
    "&:hover": {
      textDecoration: "underline",
      color: theme.vars.palette.primary.light
    },
    "&:visited": {
      color: theme.vars.palette.primary.dark
    },
    ".link-icon": {
      fontSize: "inherit",
      opacity: 0.8
    }
  });

export interface ExternalLinkProps {
  /** URL to link to */
  href: string;
  /** Link text/content */
  children: React.ReactNode;
  /** Icon variant */
  iconVariant?: "arrow" | "open" | "launch" | "none";
  /** Text size */
  size?: "small" | "medium" | "large";
  /** Optional tooltip text */
  tooltip?: string;
  /** Custom class name */
  className?: string;
}

export const ExternalLink: React.FC<ExternalLinkProps> = ({
  href,
  children,
  iconVariant = "arrow",
  size = "medium",
  tooltip,
  className
}) => {
  const theme = useTheme();

  const fontSize =
    size === "small"
      ? theme.fontSizeSmaller
      : size === "large"
      ? theme.fontSizeNormal
      : theme.fontSizeSmall;

  const getIcon = () => {
    switch (iconVariant) {
      case "open":
        return <OpenInNewIcon className="link-icon" />;
      case "launch":
        return <LaunchIcon className="link-icon" />;
      case "arrow":
        return <NorthEastIcon className="link-icon" />;
      case "none":
      default:
        return null;
    }
  };

  const link = (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      css={styles(theme)}
      className={`external-link nodrag ${className || ""}`}
      style={{ fontSize }}
    >
      <span>{children}</span>
      {getIcon()}
    </a>
  );

  if (tooltip) {
    return (
      <Tooltip title={tooltip} enterDelay={TOOLTIP_ENTER_DELAY}>
        {link}
      </Tooltip>
    );
  }

  return link;
};

export default ExternalLink;
