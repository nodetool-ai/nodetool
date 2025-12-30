import React from "react";
import { Menu, MenuProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";

export interface EditorMenuProps extends MenuProps {}

/**
 * EditorMenu is a themed menu component for the editor UI.
 * It handles portal rendering correctly by applying styles via slotProps.
 * Use this for menus that render outside the editor subtree.
 */
export const EditorMenu: React.FC<EditorMenuProps> = ({
  slotProps,
  ...props
}) => {
  const theme = useTheme();

  return (
    <Menu
      {...props}
      slotProps={{
        ...slotProps,
        paper: {
          ...slotProps?.paper,
          sx: {
            backgroundColor: theme.vars.palette.grey[800],
            border: `1px solid ${theme.vars.palette.divider}`,
            borderRadius: "8px",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(10px)",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...(slotProps?.paper as any)?.sx
          }
        }
      }}
    />
  );
};

EditorMenu.displayName = "EditorMenu";
