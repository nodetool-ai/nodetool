import { useCallback, useState, type MouseEvent, type ReactNode } from "react";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import { ContextMenu, EditorButton, Tooltip } from "../ui_primitives";

interface MenuButtonProps {
  label: string;
  icon: ReactNode;
  tooltip: string;
  children: (close: () => void) => ReactNode;
}

/** A compact button that opens a menu below itself. */
export const MenuButton = ({ label, icon, tooltip, children }: MenuButtonProps) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const close = useCallback(() => setAnchorEl(null), []);
  return (
    <>
      <Tooltip title={tooltip}>
        <EditorButton
          density="compact"
          variant="text"
          startIcon={icon}
          endIcon={<ExpandMoreIcon />}
          aria-haspopup="menu"
          aria-expanded={anchorEl !== null}
          onClick={(e: MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget)}
        >
          {label}
        </EditorButton>
      </Tooltip>
      <ContextMenu
        open={anchorEl !== null}
        anchorEl={anchorEl}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        {children(close)}
      </ContextMenu>
    </>
  );
};
