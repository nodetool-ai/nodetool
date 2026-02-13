/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useMemo } from "react";
import { Tooltip } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import NorthEastIcon from "@mui/icons-material/NorthEast";

interface ExternalLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  size?: "small" | "medium" | "large";
  tooltipText?: string;
}

const ExternalLink = React.forwardRef<HTMLAnchorElement, ExternalLinkProps>(
  ({ href, children, className, size = "small", tooltipText }, ref) => {
    const theme = useTheme();

    const linkStyles = useMemo(
      () =>
        css({
          color: theme.vars.palette.grey[400],
          textDecoration: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: theme.spacing(0.5),
          "&:hover": {
            textDecoration: "underline"
          }
        }),
      [theme]
    );

    const fontSize = useMemo(
      () =>
        size === "small"
          ? theme.fontSizeSmaller
          : size === "medium"
          ? theme.fontSizeSmall
          : theme.fontSizeNormal,
      [size, theme.fontSizeSmaller, theme.fontSizeSmall, theme.fontSizeNormal]
    );

    const iconStyle = useMemo(
      () => ({
        marginLeft: theme.spacing(0.5),
        fontSize: theme.fontSizeSmall,
        color: theme.vars.palette.c_link,
        opacity: 0.8
      }),
      [theme]
    );

    const link = (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        css={linkStyles}
        style={{ fontSize }}
        className={className}
        ref={ref}
      >
        <span>{children}</span>
        <NorthEastIcon fontSize={size} sx={iconStyle} />
      </a>
    );

    return tooltipText ? <Tooltip title={tooltipText}>{link}</Tooltip> : link;
  }
);

ExternalLink.displayName = "ExternalLink";

export default memo(ExternalLink);
