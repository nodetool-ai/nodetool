/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useEffect, useState } from "react";
import useNamespaceTree, { NamespaceTree } from "../../hooks/useNamespaceTree";
import { useMetadata } from "../../serverState/useMetadata";
import { NestedDropdown } from 'mui-nested-menu';
import { Box, Chip } from "@mui/material";

interface NodeSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
}
interface MenuItemData {
  label: string;
  value?: string;
  items: MenuItemData[];
  callback?: (event: any, item: any) => void;
  checked?: boolean;
}

const NodeSelect: React.FC<NodeSelectProps> = ({
  value,
  onChange,
}) => {
  const { data: metadata } = useMetadata();
  const namespaceTree = useNamespaceTree();
  const [selectedValues, setSelectedValues] = useState<string[]>([]);

  useEffect(() => {
    if (value !== undefined) {
      setSelectedValues(value);
    }
  }, [value]);

  const handleChange = (event: any, item: any) => {
    const { value } = item;
    const newSelectedValues = [...selectedValues, value];
    setSelectedValues(newSelectedValues);
    onChange(newSelectedValues);
  };

  const renderNamespaceMenuItems = (tree: NamespaceTree, parentPath = ""): MenuItemData[] => {
    return Object.entries(tree).map(([namespace, subtree]) => {
      const path = parentPath ? `${parentPath}.${namespace}` : namespace;
      const nodeTypes = metadata?.metadata
        ? metadata.metadata.filter((md) =>
          md.namespace === path
        ).map((md) => md.node_type)
        : [];

      return {
        label: namespace,
        value: path,
        items: [
          ...nodeTypes.map((nodeType) => ({
            label: metadata?.metadataByType[nodeType]?.title,
            value: nodeType,
            callback: handleChange,
            checked: selectedValues.includes(nodeType),
          })),
          ...renderNamespaceMenuItems(subtree.children, path),
        ] as MenuItemData[],
      };
    });
  };

  const menuItemsData: MenuItemData = {
    label: "Select Nodes",
    items: renderNamespaceMenuItems(namespaceTree),
  };

  const selected = metadata?.metadata.filter((md) =>
    selectedValues.includes(md.node_type)
  ) || [];

  return (
    <>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {selected.map((md) => (
          <Chip
            key={md.node_type}
            label={md.title}
            onDelete={() => {
              const updatedValues = selectedValues.filter((val) => val !== md.node_type);
              setSelectedValues(updatedValues);
              onChange(updatedValues);
            }}
          />
        ))}
      </Box>
      <NestedDropdown
        menuItemsData={menuItemsData}
        MenuProps={{ elevation: 3 }}
        ButtonProps={{ variant: "outlined" }}
        onClick={() => { }}
      />
    </>
  );
};

export default NodeSelect;