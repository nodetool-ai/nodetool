/**
 * FormSection Component
 *
 * A titled group of form fields: an optional uppercase group label above a
 * vertical stack with on-grid gaps. Replaces hand-rolled `.group-label` +
 * flex-column CSS (see StoryboardBoard's header fields).
 */

import React, { forwardRef } from "react";
import { Box } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { SxProps, Theme } from "@mui/material/styles";
import { SPACING, resolveSpacing, type SpacingValue } from "./spacing";
import { FONT_SIZE_SANS, FONT_WEIGHT } from "./tokens";

export interface FormSectionProps {
  /** Optional uppercase group label above the body */
  label?: string;
  /** Gap between fields (SPACING units), default SPACING.lg (12px) */
  gap?: SpacingValue;
  children: React.ReactNode;
  className?: string;
  sx?: SxProps<Theme>;
}

/**
 * FormSection - A titled group of form fields
 *
 * @example
 * <FormSection label="Run settings">
 *   <SelectField label="Provider" ... />
 *   <TextInput label="Model" ... />
 * </FormSection>
 */
export const FormSection = forwardRef<HTMLDivElement, FormSectionProps>(
  ({ label, gap = SPACING.lg, children, className, sx }, ref) => {
    const theme = useTheme();

    return (
      <Box
        ref={ref}
        className={className}
        // Compose caller sx as an array so the function form `(theme) =>
        // ({...})` is honored — spreading `...sx` silently drops callbacks.
        sx={[...(Array.isArray(sx) ? sx : [sx])]}
      >
        {label && (
          // A group heading, not a <label>: there is no single control to
          // reference, so a plain div avoids a dangling label association.
          <Box
            sx={{
              textTransform: "uppercase",
              fontSize: FONT_SIZE_SANS.caption,
              fontWeight: FONT_WEIGHT.medium,
              letterSpacing: "0.08em",
              color: theme.vars.palette.text.disabled,
              marginBottom: theme.spacing(SPACING.md)
            }}
          >
            {label}
          </Box>
        )}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: theme.spacing(resolveSpacing(gap))
          }}
        >
          {children}
        </Box>
      </Box>
    );
  }
);

FormSection.displayName = "FormSection";
