/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo } from "react";
import { Tooltip } from "../ui_primitives";
import { useTheme } from "@mui/material/styles";
import NorthEastIcon from "@mui/icons-material/NorthEast";

interface ExternalLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  size?: "small" | "medium" | "large";
  tooltipText?: string;
  ref?: React.Ref<HTMLAnchorElement>;
}

function ExternalLink({
  href,
  children,
  className,
  size = "small",
  tooltipText,
  ref
}: ExternalLinkProps) {
  const theme = useTheme();

  const linkStyles = css({
    color: theme.vars.palette.grey[400],
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
          color: theme.vars.palette.c_link,
          opacity: 0.8
        }}
      />
    </a>
  );

  return tooltipText ? <Tooltip title={tooltipText}>{link}</Tooltip> : link;
}

export default memo(ExternalLink);
