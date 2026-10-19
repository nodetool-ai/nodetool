/** @jsxImportSource @emotion/react */
import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useReactFlow } from "@xyflow/react";
import { useTheme } from "@mui/material/styles";
import {
  Divider,
  MobileBottomSheet,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  menuGroupHeaderStyles
} from "../ui_primitives";
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

import SouthEastIcon from "@mui/icons-material/SouthEast";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import AddCommentIcon from "@mui/icons-material/AddComment";
import GroupWorkIcon from "@mui/icons-material/GroupWork";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import NumbersIcon from "@mui/icons-material/Numbers";
import ChatIcon from "@mui/icons-material/Chat";
import ImageIcon from "@mui/icons-material/Image";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";

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
    padding: `0 ${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xl)} ${getSpacingPx(SPACING.md)}`,
    ".menu-item": {
      borderRadius: BORDER_RADIUS.lg,
      margin: `${getSpacingPx(SPACING.micro)} 0`,
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
      color: theme.vars.palette.text.secondary
    },
    "& .MuiListSubheader-root": {
      ...menuGroupHeaderStyles(theme),
      backgroundColor: "transparent",
      paddingTop: getSpacingPx(SPACING.sm),
      paddingBottom: getSpacingPx(SPACING.xs)
    }
  });

const dividerSx = { margin: `${getSpacingPx(SPACING.lg)} 0` } as const;

interface MobilePaneMenuProps {
  open: boolean;
  onClose: () => void;
}

const MobilePaneMenu: React.FC<MobilePaneMenuProps> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { handlePaste } = useCopyPaste();
  const reactFlowInstance = useReactFlow();
  const { isClipboardValid } = useClipboard();
  const fitView = useFitView();

  const { createNode, addNode } = useNodes((state) => ({
    createNode: state.createNode,
    addNode: state.addNode
  }), shallow);

  const getViewportCenter = useCallback(() => {
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
      title={t("screens4_4.mobilePane.title")}
      ariaLabel={t("screens4_4.mobilePane.ariaLabel")}
    >
      <div className="menu-content" css={styles(theme)}>
        <List dense>
          <ListSubheader disableSticky>{t("screens4_4.mobilePane.actions")}</ListSubheader>
          <ListItem className={`menu-item ${!isClipboardValid ? "disabled" : ""}`}>
            <ListItemButton onClick={handlePasteAction} disabled={!isClipboardValid}>
              <ListItemIcon className="menu-item-icon">
                <SouthEastIcon />
              </ListItemIcon>
              <ListItemText 
                className="menu-item-text"
                primary={t("screens4_4.mobilePane.paste")}
                secondary={!isClipboardValid ? t("screens4_4.mobilePane.noValidNodes") : t("screens4_4.mobilePane.pasteCopiedNodes")}
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
                primary={t("screens4_4.mobilePane.fitScreen")}
                secondary={t("screens4_4.mobilePane.centerNodes")}
              />
            </ListItemButton>
          </ListItem>

          <Divider sx={dividerSx} />

          <ListSubheader disableSticky>{t("screens4_4.mobilePane.aiNodes")}</ListSubheader>
          <ListItem className="menu-item">
            <ListItemButton onClick={addAgentNode}>
              <ListItemIcon className="menu-item-icon">
                <SupportAgentIcon />
              </ListItemIcon>
              <ListItemText 
                className="menu-item-text"
                primary={t("screens4_4.mobilePane.addAgent")}
                secondary={t("screens4_4.mobilePane.agentDescription")}
              />
            </ListItemButton>
          </ListItem>

          <Divider sx={dividerSx} />

          <ListSubheader disableSticky>{t("screens4_4.mobilePane.inputNodes")}</ListSubheader>
          <ListItem className="menu-item">
            <ListItemButton onClick={addInputNode} data-node-type="StringInput">
              <ListItemIcon className="menu-item-icon">
                <TextFieldsIcon />
              </ListItemIcon>
              <ListItemText
                className="menu-item-text"
                primary={t("screens4_4.mobilePane.stringInput")}
                secondary={t("screens4_4.mobilePane.textInputDescription")}
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
                primary={t("screens4_4.mobilePane.integerInput")}
                secondary={t("screens4_4.mobilePane.wholeNumberDescription")}
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
                primary={t("screens4_4.mobilePane.floatInput")}
                secondary={t("screens4_4.mobilePane.decimalNumberDescription")}
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
                primary={t("screens4_4.mobilePane.chatInput")}
                secondary={t("screens4_4.mobilePane.chatMessageDescription")}
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
                primary={t("screens4_4.mobilePane.imageInput")}
                secondary={t("screens4_4.mobilePane.imageFileDescription")}
              />
            </ListItemButton>
          </ListItem>

          <Divider sx={dividerSx} />

          <ListSubheader disableSticky>{t("screens4_4.mobilePane.organization")}</ListSubheader>
          <ListItem className="menu-item">
            <ListItemButton onClick={addComment}>
              <ListItemIcon className="menu-item-icon">
                <AddCommentIcon />
              </ListItemIcon>
              <ListItemText 
                className="menu-item-text"
                primary={t("screens4_4.mobilePane.addComment")}
                secondary={t("screens4_4.mobilePane.commentDescription")}
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
                primary={t("screens4_4.mobilePane.addGroup")}
                secondary={t("screens4_4.mobilePane.groupDescription")}
              />
            </ListItemButton>
          </ListItem>
        </List>
      </div>
    </MobileBottomSheet>
  );
};

export default React.memo(MobilePaneMenu);
