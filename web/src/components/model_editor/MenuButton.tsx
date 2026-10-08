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
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const close = useCallback(() => setPosition(null), []);
  return (
    <>
      <Tooltip title={tooltip}>
        <EditorButton
          density="compact"
          variant="text"
          startIcon={icon}
          endIcon={<ExpandMoreIcon />}
          aria-haspopup="menu"
          aria-expanded={position !== null}
          onClick={(e: MouseEvent<HTMLElement>) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setPosition({ x: rect.left, y: rect.bottom + 4 });
          }}
        >
          {label}
        </EditorButton>
      </Tooltip>
      <ContextMenu open={position !== null} position={position} onClose={close} compact minWidth={200}>
        {children(close)}
      </ContextMenu>
    </>
  );
};
