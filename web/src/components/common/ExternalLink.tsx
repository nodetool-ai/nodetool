/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { useTheme, Tooltip } from "@mui/material";
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

    const linkStyles = css({
      color: theme.palette.grey[400],
      textDecoration: "none",
      display: "inline-flex",
      alignItems: "center",
      gap: theme.spacing(0.5),
      "&:hover": {
        textDecoration: "underline"
      }
    });

    const link = (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        css={linkStyles}
        style={{
          fontSize:
            size === "small"
              ? theme.fontSizeSmaller
              : size === "medium"
              ? theme.fontSizeSmall
              : theme.fontSizeNormal
        }}
        className={className}
        ref={ref}
      >
        <span>{children}</span>
        <NorthEastIcon
          fontSize={size}
          sx={{
            marginLeft: theme.spacing(0.5),
            fontSize: theme.fontSizeSmall,
            color: theme.palette.c_link,
            opacity: 0.8
          }}
        />
      </a>
    );

    return tooltipText ? <Tooltip title={tooltipText}>{link}</Tooltip> : link;
  }
);
ExternalLink.displayName = "ExternalLink";

export default ExternalLink;
