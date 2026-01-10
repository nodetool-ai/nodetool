/** @jsxImportSource @emotion/react */
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Box, Tooltip, IconButton } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { css } from "@emotion/react";
import { useReactFlow, getViewportForBounds, getNodesBounds } from "@xyflow/react";
import { useNodes } from "../../contexts/NodeContext";
import { useCopyPaste } from "../../hooks/handlers/useCopyPaste";
import useAlignNodes from "../../hooks/useAlignNodes";
import { useSurroundWithGroup } from "../../hooks/nodes/useSurroundWithGroup";
import { useDuplicateNodes } from "../../hooks/useDuplicate";

interface QuickActionsToolbarProps {
  onCopy?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onAlign?: () => void;
  onGroup?: () => void;
  onBypass?: () => void;
}

interface Action {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
}

const styles = (theme: Theme) =>
  css({
    position: "absolute",
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: "6px",
    backgroundColor: theme.vars.palette.background.paper,
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
    border: `1px solid ${theme.vars.palette.divider}`,
    transition: "opacity 0.15s ease-in-out, transform 0.15s ease-in-out",
    "&::before": {
      content: '""',
      position: "absolute",
      bottom: "-8px",
      left: "50%",
      transform: "translateX(-50%)",
      borderWidth: "8px 8px 0",
      borderStyle: "solid",
      borderColor: `${theme.vars.palette.background.paper} transparent transparent transparent`
    }
  });

const iconButtonStyles = css({
  width: "32px",
  height: "32px",
  padding: "6px",
  "& .MuiSvgIcon-root": {
    fontSize: "18px"
  }
});

const QuickActionsToolbar: React.FC<QuickActionsToolbarProps> = ({
  onCopy,
  onDelete,
  onDuplicate,
  onAlign,
  onGroup,
  onBypass
}) => {
  const theme = useTheme();
  const reactFlow = useReactFlow();
  const nodes = useNodes((state) => state.nodes);
  const toggleBypassSelected = useNodes((state) => state.toggleBypassSelected);
  const deleteNode = useNodes((state) => state.deleteNode);
  const copyPaste = useCopyPaste();
  const alignNodes = useAlignNodes();
  const surroundWithGroup = useSurroundWithGroup();
  const duplicateNodes = useDuplicateNodes();

  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  const selectedNodes = useMemo(() => {
    return nodes.filter((node) => node.selected);
  }, [nodes]);

  const handleCopy = useCallback(() => {
    copyPaste.handleCopy();
  }, [copyPaste]);

  const handleDeleteNodes = useCallback(() => {
    selectedNodes.forEach((node) => {
      deleteNode(node.id);
    });
  }, [selectedNodes, deleteNode]);

  const handleDuplicate = useCallback(() => {
    duplicateNodes();
  }, [duplicateNodes]);

  const handleAlign = useCallback(() => {
    alignNodes({ arrangeSpacing: false });
  }, [alignNodes]);

  const handleGroup = useCallback(() => {
    if (selectedNodes.length > 0) {
      surroundWithGroup({ selectedNodes });
    }
  }, [surroundWithGroup, selectedNodes]);

  const handleBypass = useCallback(() => {
    toggleBypassSelected();
  }, [toggleBypassSelected]);

  const hideToolbar = useCallback(() => {
    setVisible(false);
    setPosition(null);
  }, []);

  useEffect(() => {
    if (selectedNodes.length === 0) {
      hideToolbar();
      return;
    }

    const bounds = getNodesBounds(selectedNodes);
    const viewport = { x: 0, y: 0, zoom: 1 };

    const { x, y } = getViewportForBounds(
      bounds,
      bounds.width,
      bounds.height,
      0.5,
      2,
      viewport
    );

    const centerX = x + bounds.width / 2;
    const centerY = y - 50;

    setPosition({ x: centerX, y: centerY });
    setVisible(true);
  }, [nodes, selectedNodes]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        hideToolbar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [hideToolbar]);

  const actions = useMemo<Action[]>(() => {
    const selectedCount = selectedNodes.length;
    const hasNodes = selectedCount > 0;
    const isSingleNode = selectedCount === 1;
    const canGroup = selectedCount >= 2;

    const handleCopyClick = () => {
      if (onCopy) {
        onCopy();
      } else {
        handleCopy();
      }
    };

    const handleDuplicateClick = () => {
      if (onDuplicate) {
        onDuplicate();
      } else {
        handleDuplicate();
      }
    };

    const handleAlignClick = () => {
      if (onAlign) {
        onAlign();
      } else {
        handleAlign();
      }
    };

    const handleGroupClick = () => {
      if (onGroup) {
        onGroup();
      } else {
        handleGroup();
      }
    };

    const handleBypassClick = () => {
      if (onBypass) {
        onBypass();
      } else {
        handleBypass();
      }
    };

    const handleDeleteClick = () => {
      if (onDelete) {
        onDelete();
      } else {
        handleDeleteNodes();
      }
    };

    return [
      {
        id: "copy",
        label: "Copy",
        shortcut: "Ctrl+C",
        icon: <CopyIcon />,
        onClick: handleCopyClick,
        disabled: !hasNodes
      },
      {
        id: "duplicate",
        label: "Duplicate",
        shortcut: "Ctrl+D",
        icon: <DuplicateIcon />,
        onClick: handleDuplicateClick,
        disabled: !hasNodes
      },
      {
        id: "align",
        label: "Align",
        icon: <AlignIcon />,
        onClick: handleAlignClick,
        disabled: !canGroup
      },
      {
        id: "group",
        label: "Group",
        shortcut: "Ctrl+G",
        icon: <GroupIcon />,
        onClick: handleGroupClick,
        disabled: !canGroup
      },
      {
        id: "bypass",
        label: "Bypass",
        icon: <BypassIcon />,
        onClick: handleBypassClick,
        disabled: !isSingleNode
      },
      {
        id: "delete",
        label: "Delete",
        shortcut: "Del",
        icon: <DeleteIcon />,
        onClick: handleDeleteClick,
        disabled: !hasNodes
      }
    ];
  }, [selectedNodes, onCopy, onDelete, onDuplicate, onAlign, onGroup, onBypass, handleCopy, handleDeleteNodes, handleDuplicate, handleAlign, handleGroup, handleBypass]);

  if (!visible || !position) {
    return null;
  }

  const handleActionClick = (action: Action) => {
    if (!action.disabled) {
      action.onClick();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      hideToolbar();
    }
  };

  return (
    <Box
      css={styles(theme)}
      style={{
        left: position.x,
        top: position.y,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(10px)",
        pointerEvents: visible ? "auto" : "none"
      }}
      onKeyDown={handleKeyDown}
      role="toolbar"
      aria-label="Quick actions toolbar"
      tabIndex={0}
    >
      {actions.map((action) => (
        <Tooltip key={action.id} title={action.label} placement="top">
          <span>
            <IconButton
              css={iconButtonStyles}
              size="small"
              onClick={() => handleActionClick(action)}
              disabled={action.disabled}
              aria-label={action.label}
              sx={{
                color: action.disabled
                  ? theme.vars.palette.text.disabled
                  : theme.vars.palette.text.primary,
                backgroundColor: "transparent",
                "&:hover": {
                  backgroundColor: action.disabled
                    ? "transparent"
                    : theme.vars.palette.action.hover,
                  color: action.disabled
                    ? theme.vars.palette.text.disabled
                    : theme.vars.palette.primary.main
                },
                transition: "all 0.15s ease-in-out"
              }}
            >
              {action.icon}
            </IconButton>
          </span>
        </Tooltip>
      ))}
    </Box>
  );
};

function CopyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function DuplicateIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6" />
      <path d="M21 10H9" />
      <rect x="3" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function AlignIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
      <circle cx="9" cy="6" r="1.5" fill="currentColor" />
      <circle cx="15" cy="12" r="1.5" fill="currentColor" />
      <circle cx="9" cy="18" r="1.5" fill="currentColor" />
    </svg>
  );
}

function GroupIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function BypassIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export default memo(QuickActionsToolbar);
