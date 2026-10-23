/** @jsxImportSource @emotion/react */
import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useReactFlow } from "@xyflow/react";
import { useTheme } from "@mui/material/styles";
import {
  Divider,
  MobileBottomSheet,
  SPACING,
  getSpacingPx,
  ListGroup,
  ListItemRow,
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
      margin: `${getSpacingPx(SPACING.micro)} 0`
    },
    ".menu-item .MuiListItemIcon-root": {
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
    (nodeType: string) => {
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
        <ListGroup compact>
          <ListSubheader disableSticky>{t("screens4_4.mobilePane.actions")}</ListSubheader>
          <ListItemRow
            className="menu-item"
            onClick={handlePasteAction}
            disabled={!isClipboardValid}
            icon={<SouthEastIcon />}
            primary={t("screens4_4.mobilePane.paste")}
            secondary={!isClipboardValid ? t("screens4_4.mobilePane.noValidNodes") : t("screens4_4.mobilePane.pasteCopiedNodes")}
          />
          <ListItemRow
            className="menu-item"
            onClick={handleFitScreen}
            icon={<FitScreenIcon />}
            primary={t("screens4_4.mobilePane.fitScreen")}
            secondary={t("screens4_4.mobilePane.centerNodes")}
          />

          <Divider sx={dividerSx} />

          <ListSubheader disableSticky>{t("screens4_4.mobilePane.aiNodes")}</ListSubheader>
          <ListItemRow
            className="menu-item"
            onClick={addAgentNode}
            icon={<SupportAgentIcon />}
            primary={t("screens4_4.mobilePane.addAgent")}
            secondary={t("screens4_4.mobilePane.agentDescription")}
          />

          <Divider sx={dividerSx} />

          <ListSubheader disableSticky>{t("screens4_4.mobilePane.inputNodes")}</ListSubheader>
          <ListItemRow
            className="menu-item"
            onClick={() => addInputNode("StringInput")}
            icon={<TextFieldsIcon />}
            primary={t("screens4_4.mobilePane.stringInput")}
            secondary={t("screens4_4.mobilePane.textInputDescription")}
          />
          <ListItemRow
            className="menu-item"
            onClick={() => addInputNode("IntegerInput")}
            icon={<NumbersIcon />}
            primary={t("screens4_4.mobilePane.integerInput")}
            secondary={t("screens4_4.mobilePane.wholeNumberDescription")}
          />
          <ListItemRow
            className="menu-item"
            onClick={() => addInputNode("FloatInput")}
            icon={<NumbersIcon />}
            primary={t("screens4_4.mobilePane.floatInput")}
            secondary={t("screens4_4.mobilePane.decimalNumberDescription")}
          />
          <ListItemRow
            className="menu-item"
            onClick={() => addInputNode("ChatInput")}
            icon={<ChatIcon />}
            primary={t("screens4_4.mobilePane.chatInput")}
            secondary={t("screens4_4.mobilePane.chatMessageDescription")}
          />
          <ListItemRow
            className="menu-item"
            onClick={() => addInputNode("ImageInput")}
            icon={<ImageIcon />}
            primary={t("screens4_4.mobilePane.imageInput")}
            secondary={t("screens4_4.mobilePane.imageFileDescription")}
          />

          <Divider sx={dividerSx} />

          <ListSubheader disableSticky>{t("screens4_4.mobilePane.organization")}</ListSubheader>
          <ListItemRow
            className="menu-item"
            onClick={addComment}
            icon={<AddCommentIcon />}
            primary={t("screens4_4.mobilePane.addComment")}
            secondary={t("screens4_4.mobilePane.commentDescription")}
          />
          <ListItemRow
            className="menu-item"
            onClick={addGroupNode}
            icon={<GroupWorkIcon />}
            primary={t("screens4_4.mobilePane.addGroup")}
            secondary={t("screens4_4.mobilePane.groupDescription")}
          />
        </ListGroup>
      </div>
    </MobileBottomSheet>
  );
};

export default React.memo(MobilePaneMenu);
