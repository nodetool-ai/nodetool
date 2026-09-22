import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Node } from "@xyflow/react";

import { useNodeStoreRef } from "../../contexts/NodeContext";
import useMetadataStore from "../../stores/MetadataStore";
import type { NodeData } from "../../stores/NodeData";
import type { NodeMetadata, TypeMetadata } from "../../stores/ApiTypes";
import { getAllInputHandles, getAllOutputHandles } from "../../utils/handleUtils";
import { isConnectableCached } from "../node_menu/typeFilterUtils";
import {
  applyKeyboardConnection,
  buildKeyboardConnection,
  isKeyboardConnectionValid
} from "./keyboardConnection";
import {
  Box,
  Caption,
  CONTROL,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  SPACING,
  Text,
  TextInput,
  VirtualList
} from "../ui_primitives";
import type { VirtualListHandle } from "../ui_primitives";

type HandleDirection = "source" | "target";

interface KeyboardConnectionPickerProps {
  open: boolean;
  nodeId: string;
  handleId: string;
  direction: HandleDirection;
  typeMetadata: TypeMetadata;
  onClose: () => void;
}

interface ExistingPortOption {
  kind: "existing";
  key: string;
  nodeId: string;
  nodeTitle: string;
  handleId: string;
  handleTitle: string;
}

interface NewPortOption {
  kind: "new";
  key: string;
  metadata: NodeMetadata;
  nodeTitle: string;
  handleId: string;
  handleTitle: string;
}

type PortOption = ExistingPortOption | NewPortOption;

const PORT_OPTION_HEIGHT = CONTROL.height.md;
const PORT_OPTIONS_MAX_HEIGHT = CONTROL.height.xl * 8;

const titleize = (value: string): string =>
  value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const nodeTitle = (node: Node<NodeData>, metadata: NodeMetadata): string =>
  node.data.title || metadata.title || metadata.node_type;

export const KeyboardConnectionPicker = ({
  open,
  nodeId,
  handleId,
  direction,
  typeMetadata,
  onClose
}: KeyboardConnectionPickerProps) => {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const optionListRef = useRef<VirtualListHandle>(null);
  const nodeStore = useNodeStoreRef();
  const metadata = useMetadataStore((state) => state.metadata);

  const options = useMemo<PortOption[]>(() => {
    if (!open) {
      return [];
    }
    const state = nodeStore.getState();
    const existing: ExistingPortOption[] = [];

    for (const node of state.nodes) {
      if (node.id === nodeId || !node.type) {
        continue;
      }
      const nodeMetadata = metadata[node.type];
      if (!nodeMetadata) {
        continue;
      }
      const handles =
        direction === "source"
          ? getAllInputHandles(node, nodeMetadata).filter((handle) =>
              isConnectableCached(typeMetadata, handle.type)
            )
          : getAllOutputHandles(node, nodeMetadata).filter((handle) =>
              isConnectableCached(handle.type, typeMetadata)
            );
      for (const handle of handles) {
        const connection = buildKeyboardConnection(
          { nodeId, handleId, direction },
          node.id,
          handle.name
        );
        if (!isKeyboardConnectionValid(state, connection)) {
          continue;
        }
        existing.push({
          kind: "existing",
          key: `existing:${node.id}:${handle.name}`,
          nodeId: node.id,
          nodeTitle: nodeTitle(node, nodeMetadata),
          handleId: handle.name,
          handleTitle: titleize(handle.name)
        });
      }
    }

    const create: NewPortOption[] = [];
    for (const nodeMetadata of Object.values(metadata)) {
      const handles =
        direction === "source"
          ? nodeMetadata.properties.filter((property) =>
              isConnectableCached(typeMetadata, property.type)
            )
          : nodeMetadata.outputs.filter((output) =>
              isConnectableCached(output.type, typeMetadata)
            );
      for (const handle of handles) {
        create.push({
          kind: "new",
          key: `new:${nodeMetadata.node_type}:${handle.name}`,
          metadata: nodeMetadata,
          nodeTitle: nodeMetadata.title || nodeMetadata.node_type,
          handleId: handle.name,
          handleTitle: titleize(handle.name)
        });
      }
    }

    return [...existing, ...create];
  }, [direction, metadata, nodeId, nodeStore, open, typeMetadata]);

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) {
      return options;
    }
    return options.filter((option) =>
      `${option.nodeTitle} ${option.handleTitle}`
        .toLocaleLowerCase()
        .includes(normalized)
    );
  }, [options, query]);

  const boundedActiveIndex = Math.min(
    activeIndex,
    Math.max(0, filteredOptions.length - 1)
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [open, query]);

  const focusOption = useCallback(
    (index: number) => {
      if (filteredOptions.length === 0) {
        return;
      }
      const nextIndex = Math.max(
        0,
        Math.min(index, filteredOptions.length - 1)
      );
      setActiveIndex(nextIndex);
      optionListRef.current?.scrollToIndex(nextIndex, { align: "auto" });
      requestAnimationFrame(() => {
        optionListRef.current
          ?.getScrollElement()
          ?.querySelector<HTMLButtonElement>(
            `[data-port-option-index="${nextIndex}"]`
          )
          ?.focus();
      });
    },
    [filteredOptions.length]
  );

  const connectedEdgeIds = useMemo(() => {
    if (!open) {
      return [];
    }
    return nodeStore
      .getState()
      .edges.filter((edge) =>
        direction === "source"
          ? edge.source === nodeId && edge.sourceHandle === handleId
          : edge.target === nodeId && edge.targetHandle === handleId
      )
      .map((edge) => edge.id);
  }, [direction, handleId, nodeId, nodeStore, open]);

  const connect = useCallback(
    (option: PortOption) => {
      const accepted = applyKeyboardConnection(nodeStore, {
        nodeId,
        handleId,
        direction,
        option
      });
      if (!accepted) {
        return;
      }
      setQuery("");
      onClose();
    },
    [direction, handleId, nodeId, nodeStore, onClose]
  );

  const disconnect = useCallback(() => {
    const state = nodeStore.getState();
    state.deleteEdges(connectedEdgeIds);
    setQuery("");
    onClose();
  }, [connectedEdgeIds, nodeStore, onClose]);

  const handleClose = useCallback(() => {
    setQuery("");
    onClose();
  }, [onClose]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={`Connect ${titleize(handleId)}`}
      aria-label={`Connect ${titleize(handleId)}`}
      maxWidth="sm"
      fullWidth
    >
      <FlexColumn
        gap={SPACING.md}
        data-keyboard-scope="modal"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            handleClose();
          }
          event.stopPropagation();
        }}
      >
        <TextInput
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && filteredOptions.length > 0) {
              event.preventDefault();
              focusOption(0);
            }
          }}
          label="Find a compatible node or port"
          placeholder="Search compatible ports"
        />
        {connectedEdgeIds.length > 0 ? (
          <EditorButton color="error" onClick={disconnect}>
            Disconnect {connectedEdgeIds.length === 1 ? "edge" : "all edges"}
          </EditorButton>
        ) : null}
        {filteredOptions.length > 0 ? (
          <VirtualList
            ref={optionListRef}
            items={filteredOptions}
            estimateSize={PORT_OPTION_HEIGHT}
            getItemKey={(option) => option.key}
            ariaLabel="Compatible ports"
            scrollToIndex={boundedActiveIndex}
            sx={{ maxHeight: PORT_OPTIONS_MAX_HEIGHT }}
            getItemProps={(_option, index) => ({
              role: "listitem",
              "aria-posinset": index + 1,
              "aria-setsize": filteredOptions.length
            })}
            renderItem={(option, index) => (
              <EditorButton
                data-port-option-index={index}
                tabIndex={index === boundedActiveIndex ? 0 : -1}
                onClick={() => connect(option)}
                onFocus={() => setActiveIndex(index)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    focusOption(index + 1);
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    focusOption(index - 1);
                  } else if (event.key === "Home") {
                    event.preventDefault();
                    focusOption(0);
                  } else if (event.key === "End") {
                    event.preventDefault();
                    focusOption(filteredOptions.length - 1);
                  }
                }}
                sx={{ justifyContent: "flex-start", width: "100%" }}
              >
                <FlexRow gap={SPACING.sm} align="center">
                  <Text>{option.nodeTitle}</Text>
                  <Caption color="muted">{option.handleTitle}</Caption>
                  <Caption color="muted">
                    {option.kind === "existing" ? "Existing node" : "Create node"}
                  </Caption>
                </FlexRow>
              </EditorButton>
            )}
          />
        ) : (
          <Box padding={SPACING.md}>
            <Text color="muted">No compatible ports found.</Text>
          </Box>
        )}
      </FlexColumn>
    </Dialog>
  );
};

export default KeyboardConnectionPicker;
