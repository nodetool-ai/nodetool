import React from "react";
import { Menu } from "@mui/material";
import ContextMenuItem from "./ContextMenuItem";
import { Node, XYPosition } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import useMetadataStore from "../../stores/MetadataStore";

// Icons
import TextFieldsIcon from "@mui/icons-material/TextFields";
import NumbersIcon from "@mui/icons-material/Numbers";
import ChatIcon from "@mui/icons-material/Chat";
import ImageIcon from "@mui/icons-material/Image";

interface InputNodesSubmenuProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  createNode: (
    metadata: any,
    position: XYPosition,
    properties?: Record<string, any>
  ) => Node<NodeData>;
  addNode: (node: Node<NodeData>) => void;
  getPosition: (event: React.MouseEvent) => XYPosition;
  closeContextMenu: () => void;
}

const InputNodesSubmenu: React.FC<InputNodesSubmenuProps> = ({
  anchorEl,
  onClose,
  createNode,
  addNode,
  getPosition,
  closeContextMenu
}) => {
  const addInputNode = React.useCallback(
    (nodeType: string, event: React.MouseEvent | undefined) => {
      if (!event) return;
      const metadata = useMetadataStore
        .getState()
        .getMetadata(`nodetool.nodes.nodetool.input.${nodeType}`);
      if (metadata) {
        const position = getPosition(event);
        const newNode = createNode(metadata, position);
        addNode(newNode);
      }
      closeContextMenu();
    },
    [createNode, addNode, getPosition, closeContextMenu]
  );

  return (
    <Menu
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={onClose}
      anchorOrigin={{
        vertical: "top",
        horizontal: "right"
      }}
      transformOrigin={{
        vertical: "top",
        horizontal: "left"
      }}
    >
      <ContextMenuItem
        onClick={(e) => addInputNode("StringInput", e)}
        label="String Input"
        IconComponent={<TextFieldsIcon />}
        tooltip="Add a string input node"
      />
      <ContextMenuItem
        onClick={(e) => addInputNode("FloatInput", e)}
        label="Float Input"
        IconComponent={<NumbersIcon />}
        tooltip="Add a float input node"
      />
      <ContextMenuItem
        onClick={(e) => addInputNode("IntegerInput", e)}
        label="Integer Input"
        IconComponent={<NumbersIcon />}
        tooltip="Add an integer input node"
      />
      <ContextMenuItem
        onClick={(e) => addInputNode("ChatInput", e)}
        label="Chat Input"
        IconComponent={<ChatIcon />}
        tooltip="Add a chat input node"
      />
      <ContextMenuItem
        onClick={(e) => addInputNode("ImageInput", e)}
        label="Image Input"
        IconComponent={<ImageIcon />}
        tooltip="Add an image input node"
      />
    </Menu>
  );
};

export default InputNodesSubmenu;
