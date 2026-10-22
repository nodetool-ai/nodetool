/**
 * FieldError
 *
 * The validation message under a field: what is wrong with this value. The
 * same line `FormField` and `TextInput` draw for their `error`, for controls
 * that sit outside them (a schema row, a rename input, a key binding).
 *
 * A failed load or operation is not a field error. Use `ErrorBanner` for that.
 */

import React, { memo } from "react";
import { Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";

export interface FieldErrorProps {
  children: React.ReactNode;
  /** Announce the message when it appears, for errors raised by an edit. */
  alert?: boolean;
  id?: string;
  sx?: SxProps<Theme>;
}

export const FieldError = memo(function FieldError({ children, alert = false, id, sx }: FieldErrorProps) {
  return (
    <Typography
      id={id}
      variant="body2"
      role={alert ? "alert" : undefined}
      sx={[
        (theme) => ({
          fontSize: theme.fontSizeSmaller,
          color: theme.vars.palette.error.main,
          lineHeight: 1.4
        }),
        ...(Array.isArray(sx) ? sx : [sx])
      ]}
    >
      {children}
    </Typography>
  );
});
