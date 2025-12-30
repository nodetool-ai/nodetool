import React from "react";
import { Dialog, DialogProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface EditorDialogProps extends DialogProps {}

/**
 * EditorDialog is a themed dialog component for the editor UI.
 * It handles portal rendering correctly by applying styles via slotProps.
 * Use this for dialogs that render outside the editor subtree.
 */
export const EditorDialog: React.FC<EditorDialogProps> = ({
  slotProps,
  ...props
}) => {
  const theme = useTheme();

  return (
    <Dialog
      {...props}
      slotProps={{
        ...slotProps,
        paper: {
          ...slotProps?.paper,
          sx: {
            backgroundColor: theme.vars.palette.grey[800],
            border: `1px solid ${theme.vars.palette.divider}`,
            borderRadius: theme.rounded.dialog,
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...(slotProps?.paper as any)?.sx
          }
        }
      }}
    />
  );
};

EditorDialog.displayName = "EditorDialog";
