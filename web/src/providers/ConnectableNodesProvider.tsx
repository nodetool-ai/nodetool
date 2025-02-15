/**
 * Provider component that manages the state and logic for connecting nodes in the flow editor.
 * Handles node filtering, menu visibility, and connection metadata for the node connection interface.
 */

import { createContext, useState, useCallback, ReactNode } from "react";
import { NodeMetadata, TypeMetadata } from "../stores/ApiTypes";
import {
  filterTypesByInputType,
  filterTypesByOutputType
} from "../components/node_menu/typeFilterUtils";
import useMetadataStore from "../stores/MetadataStore";
import { ConnectableNodesState } from "../stores/ConnectableNodesStore";

export const ConnectableNodesContext =
  createContext<ConnectableNodesState | null>(null);

export function ConnectableNodesProvider({
  active,
  children
}: {
  active: boolean;
  children: ReactNode;
}) {
  const [nodeMetadata] = useState<NodeMetadata[]>([]);
  const [filterType, setFilterType] = useState<"input" | "output" | null>(null);
  const [typeMetadata, setTypeMetadata] = useState<TypeMetadata | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [sourceHandle, setSourceHandle] = useState<string | null>(null);
  const [targetHandle, setTargetHandle] = useState<string | null>(null);
  const [nodeId, setNodeId] = useState<string | null>(null);

  const getConnectableNodes = useCallback(() => {
    const metadata = useMetadataStore.getState().getAllMetadata();

    if (!typeMetadata || !filterType) {
      return [];
    }

    if (filterType === "input") {
      return filterTypesByInputType(metadata, typeMetadata);
    } else {
      return filterTypesByOutputType(metadata, typeMetadata);
    }
  }, [typeMetadata, filterType]);

  const showMenu = useCallback(
    (position: { x: number; y: number }) => {
      if (!active) return;
      setIsVisible(true);
      setMenuPosition(position);
    },
    [active]
  );

  const hideMenu = useCallback(() => {
    if (!active) return;
    setIsVisible(false);
    setMenuPosition(null);
  }, [active]);

  const value: ConnectableNodesState = {
    nodeMetadata,
    filterType,
    typeMetadata,
    isVisible,
    menuPosition,
    sourceHandle,
    targetHandle,
    nodeId,
    setSourceHandle,
    setTargetHandle,
    setNodeId,
    setFilterType,
    setTypeMetadata,
    getConnectableNodes,
    showMenu,
    hideMenu
  };

  return (
    <ConnectableNodesContext.Provider value={value}>
      {children}
    </ConnectableNodesContext.Provider>
  );
}
