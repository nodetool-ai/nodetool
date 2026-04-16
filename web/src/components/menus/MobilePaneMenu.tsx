/** @jsxImportSource @emotion/react */
import React, { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import {
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  useTheme
} from "@mui/material";
import { Divider, MobileBottomSheet } from "../ui_primitives";
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

//icons
import SouthEastIcon from "@mui/icons-material/SouthEast";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import AddCommentIcon from "@mui/icons-material/AddComment";
import GroupWorkIcon from "@mui/icons-material/GroupWork";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import NumbersIcon from "@mui/icons-material/Numbers";
import ChatIcon from "@mui/icons-material/Chat";
import ImageIcon from "@mui/icons-material/Image";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";

//behaviours
import { useCopyPaste } from "../../hooks/handlers/useCopyPaste";
import { useClipboard } from "../../hooks/browser/useClipboard";
import { useFitView } from "../../hooks/useFitView";
import useMetadataStore from "../../stores/MetadataStore";
import { useNodes } from "../../contexts/NodeContext";
import {
  GROUP_NODE_METADATA,
  COMMENT_NODE_METADATA
} from "../../utils/nodeUtils";
import { shallow } from "zustand/shallow";

const styles = (theme: Theme) =>
  css({
    padding: "0 8px 16px 8px",
    ".menu-item": {
      borderRadius: "8px",
      margin: "2px 0",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      },
      "&.disabled": {
        opacity: 0.5,
        pointerEvents: "none"
      }
    },
    ".menu-item-icon": {
      minWidth: "40px",
      color: theme.vars.palette.primary.main
    },
    ".menu-item-text": {
      "& .MuiListItemText-primary": {
        fontSize: "0.95rem",
        fontWeight: 500
      },
      "& .MuiListItemText-secondary": {
        fontSize: "0.8rem",
        opacity: 0.7
      }
    },
    ".menu-section-title": {
      fontSize: "0.75rem",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      color: theme.vars.palette.text.secondary,
      padding: "12px 16px 6px 16px",
      "&:first-of-type": {
        paddingTop: "4px"
      }
    }
  });

// Memoized divider style to prevent object creation on each render
const dividerSx = { margin: "12px 0" } as const;

interface MobilePaneMenuProps {
  open: boolean;
  onClose: () => void;
}

const MobilePaneMenu: React.FC<MobilePaneMenuProps> = ({ open, onClose }) => {
  const theme = useTheme();
  const { handlePaste } = useCopyPaste();
  const reactFlowInstance = useReactFlow();
  const { isClipboardValid } = useClipboard();
  const fitView = useFitView();

  const { createNode, addNode } = useNodes((state) => ({
    createNode: state.createNode,
    addNode: state.addNode
  }), shallow);

  // Get center of viewport for node positioning
  const getViewportCenter = useCallback(() => {
    // Get center of visible area
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    return reactFlowInstance.screenToFlowPosition({
      x: centerX,
      y: centerY
    });
  }, [reactFlowInstance]);

  const handleAction = useCallback((action: () => void) => {
    action();
    onClose();
  }, [onClose]);

  const handlePasteAction = useCallback(() => {
    handleAction(() => handlePaste());
  }, [handleAction, handlePaste]);

  const handleFitScreen = useCallback(() => {
    handleAction(() => fitView({ padding: 0.5 }));
  }, [handleAction, fitView]);

  const addComment = useCallback(() => {
    handleAction(() => {
      const metadata = COMMENT_NODE_METADATA;
      const position = getViewportCenter();
      const newNode = createNode(metadata, position);
      newNode.width = 150;
      newNode.height = 100;
      newNode.style = { width: 150, height: 100 };
      addNode(newNode);
    });
  }, [handleAction, createNode, addNode, getViewportCenter]);

  const addGroupNode = useCallback(() => {
    handleAction(() => {
      const metadata = GROUP_NODE_METADATA;
      const position = getViewportCenter();
      const newNode = createNode(metadata, position);
      addNode(newNode);
    });
  }, [handleAction, createNode, addNode, getViewportCenter]);

  const addInputNode = useCallback(
    (event: React.MouseEvent) => {
      const target = event.currentTarget as HTMLElement;
      const nodeType = target.dataset.nodeType;
      if (!nodeType) {
        return;
      }
      handleAction(() => {
        const metadata = useMetadataStore
          .getState()
          .getMetadata(`nodetool.input.${nodeType}`);
        if (metadata) {
          const position = getViewportCenter();
          const newNode = createNode(metadata, position);
          addNode(newNode);
        }
      });
    },
    [handleAction, createNode, addNode, getViewportCenter]
  );

  const addAgentNode = useCallback(() => {
    handleAction(() => {
      const metadata = useMetadataStore
        .getState()
        .getMetadata(`nodetool.agents.Agent`);
      if (metadata) {
        const position = getViewportCenter();
        const newNode = createNode(metadata, position);
        addNode(newNode);
      }
    });
  }, [handleAction, createNode, addNode, getViewportCenter]);

  return (
    <MobileBottomSheet
      open={open}
      onClose={onClose}
      title="Canvas Menu"
      ariaLabel="Canvas actions and node insertion"
    >
      <div className="menu-content" css={styles(theme)}>
        <List dense>
          {/* General Actions */}
          <div className="menu-section-title">Actions</div>
          <ListItem className={`menu-item ${!isClipboardValid ? "disabled" : ""}`}>
            <ListItemButton onClick={handlePasteAction} disabled={!isClipboardValid}>
              <ListItemIcon className="menu-item-icon">
                <SouthEastIcon />
              </ListItemIcon>
              <ListItemText 
                className="menu-item-text"
                primary="Paste" 
                secondary={!isClipboardValid ? "No valid nodes in clipboard" : "Paste copied nodes"}
              />
            </ListItemButton>
          </ListItem>

          <ListItem className="menu-item">
            <ListItemButton onClick={handleFitScreen}>
              <ListItemIcon className="menu-item-icon">
                <FitScreenIcon />
              </ListItemIcon>
              <ListItemText 
                className="menu-item-text"
                primary="Fit Screen" 
                secondary="Center all nodes in view"
              />
            </ListItemButton>
          </ListItem>

          <Divider sx={dividerSx} />

          {/* AI Nodes */}
          <div className="menu-section-title">AI Nodes</div>
          <ListItem className="menu-item">
            <ListItemButton onClick={addAgentNode}>
              <ListItemIcon className="menu-item-icon">
                <SupportAgentIcon />
              </ListItemIcon>
              <ListItemText 
                className="menu-item-text"
                primary="Add Agent" 
                secondary="AI agent for processing"
              />
            </ListItemButton>
          </ListItem>

          <Divider sx={dividerSx} />

          {/* Input Nodes */}
          <div className="menu-section-title">Input Nodes</div>
          <ListItem className="menu-item">
            <ListItemButton onClick={addInputNode} data-node-type="StringInput">
              <ListItemIcon className="menu-item-icon">
                <TextFieldsIcon />
              </ListItemIcon>
              <ListItemText
                className="menu-item-text"
                primary="String Input"
                secondary="Text input field"
              />
            </ListItemButton>
          </ListItem>

          <ListItem className="menu-item">
            <ListItemButton onClick={addInputNode} data-node-type="IntegerInput">
              <ListItemIcon className="menu-item-icon">
                <NumbersIcon />
              </ListItemIcon>
              <ListItemText
                className="menu-item-text"
                primary="Integer Input"
                secondary="Whole number input"
              />
            </ListItemButton>
          </ListItem>

          <ListItem className="menu-item">
            <ListItemButton onClick={addInputNode} data-node-type="FloatInput">
              <ListItemIcon className="menu-item-icon">
                <NumbersIcon />
              </ListItemIcon>
              <ListItemText
                className="menu-item-text"
                primary="Float Input"
                secondary="Decimal number input"
              />
            </ListItemButton>
          </ListItem>

          <ListItem className="menu-item">
            <ListItemButton onClick={addInputNode} data-node-type="ChatInput">
              <ListItemIcon className="menu-item-icon">
                <ChatIcon />
              </ListItemIcon>
              <ListItemText
                className="menu-item-text"
                primary="Chat Input"
                secondary="Chat message input"
              />
            </ListItemButton>
          </ListItem>

          <ListItem className="menu-item">
            <ListItemButton onClick={addInputNode} data-node-type="ImageInput">
              <ListItemIcon className="menu-item-icon">
                <ImageIcon />
              </ListItemIcon>
              <ListItemText
                className="menu-item-text"
                primary="Image Input"
                secondary="Image file input"
              />
            </ListItemButton>
          </ListItem>

          <Divider sx={dividerSx} />

          {/* Organization */}
          <div className="menu-section-title">Organization</div>
          <ListItem className="menu-item">
            <ListItemButton onClick={addComment}>
              <ListItemIcon className="menu-item-icon">
                <AddCommentIcon />
              </ListItemIcon>
              <ListItemText 
                className="menu-item-text"
                primary="Add Comment" 
                secondary="Text comment note"
              />
            </ListItemButton>
          </ListItem>

          <ListItem className="menu-item">
            <ListItemButton onClick={addGroupNode}>
              <ListItemIcon className="menu-item-icon">
                <GroupWorkIcon />
              </ListItemIcon>
              <ListItemText
                className="menu-item-text"
                primary="Add Group"
                secondary="Group container for nodes"
              />
            </ListItemButton>
          </ListItem>
        </List>
      </div>
    </MobileBottomSheet>
  );
};

export default React.memo(MobilePaneMenu);
