/**
 * TextLink Component
 *
 * A semantic link primitive wrapping MUI Link with standardized
 * external link handling and consistent styling.
 */

import React, { memo } from "react";
import MuiLink, { LinkProps as MuiLinkProps } from "@mui/material/Link";
import { useTheme } from "@mui/material/styles";

export interface TextLinkProps extends Omit<MuiLinkProps, "underline"> {
  /** Open link in new tab (adds target="_blank" and rel="noopener noreferrer") */
  external?: boolean;
  /** Underline behavior. Defaults to "hover". */
  underline?: "none" | "hover" | "always";
  /** Render as a button element instead of an anchor */
  asButton?: boolean;
}

/**
 * TextLink - Consistent link with external-safe defaults
 *
 * @example
 * // External link (opens in new tab)
 * <TextLink href="https://example.com" external>
 *   Visit Example
 * </TextLink>
 *
 * @example
 * // Internal navigation link
 * <TextLink href="/settings" color="primary">
 *   Settings
 * </TextLink>
 *
 * @example
 * // Button-style link
 * <TextLink asButton onClick={handleClick}>
 *   Click me
 * </TextLink>
 */
const TextLinkInternal: React.FC<TextLinkProps> = ({
  external = false,
  underline = "hover",
  asButton = false,
  sx,
  children,
  ...props
}) => {
  const theme = useTheme();

  const externalProps = external
    ? { target: "_blank", rel: "noopener noreferrer" }
    : {};

  return (
    <MuiLink
      component={asButton ? "button" : "a"}
      underline={underline}
      sx={{
        color: theme.vars.palette.primary.main,
        cursor: "pointer",
        ...(asButton && {
          background: "none",
          border: "none",
          padding: 0,
          font: "inherit"
        }),
        ...sx
      }}
      {...externalProps}
      {...props}
    >
      {children}
    </MuiLink>
  );
};

export const TextLink = memo(TextLinkInternal);
