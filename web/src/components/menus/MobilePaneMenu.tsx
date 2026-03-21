/** @jsxImportSource @emotion/react */
import React, { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import {
  Dialog,
  DialogContent,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  useTheme
} from "@mui/material";
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

//primitives
import { CloseButton } from "../ui_primitives";

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

const styles = (theme: Theme) =>
  css({
    ".mobile-pane-menu-dialog": {
      "& .MuiDialog-paper": {
        borderRadius: "0px",
        maxWidth: "100vw",
        width: "100vw",
        maxHeight: "100vh",
        backgroundColor: theme.vars.palette.grey[900],
        backgroundImage: "none"
      }
    },
    ".menu-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "56px 24px 8px 24px", /* Added 40px top padding for header + 16px original */
      backgroundColor: theme.vars.palette.grey[900],
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`
    },
    ".menu-title": {
      fontSize: "1.2rem",
      fontWeight: 600,
      color: theme.vars.palette.grey[0]
    },
    ".menu-content": {
      padding: "0 8px 16px 8px",
      backgroundColor: theme.vars.palette.grey[900]
    },
    ".menu-item": {
      borderRadius: "8px",
      margin: "2px 0",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[800]
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
      color: theme.vars.palette.grey[300],
      padding: "16px 16px 8px 16px",
      marginTop: "8px",
      backgroundColor: theme.vars.palette.grey[900],
      "&:first-of-type": {
        marginTop: 0
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
  }));

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
    (nodeType: string) => () => {
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
    <Dialog
      open={open}
      onClose={onClose}
      className="mobile-pane-menu-dialog"
      css={styles(theme)}
      maxWidth={false}
      fullScreen
      PaperProps={{
        elevation: 0
      }}
      BackdropProps={{
        style: { backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.8)` }
      }}
    >
      <div className="menu-header">
        <div className="menu-title">Canvas Menu</div>
        <CloseButton onClick={onClose} buttonSize="small" tooltip="Close" />
      </div>

      <DialogContent className="menu-content">
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
            <ListItemButton onClick={addInputNode("StringInput")}>
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
            <ListItemButton onClick={addInputNode("IntegerInput")}>
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
            <ListItemButton onClick={addInputNode("FloatInput")}>
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
            <ListItemButton onClick={addInputNode("ChatInput")}>
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
            <ListItemButton onClick={addInputNode("ImageInput")}>
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
      </DialogContent>
    </Dialog>
  );
};

export default React.memo(MobilePaneMenu);
