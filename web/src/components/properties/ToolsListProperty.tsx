import React, { memo, useCallback, useMemo } from "react";
import { IconButton, Stack, Tooltip } from "@mui/material";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import { isEqual } from "lodash";
import { IconForType } from "../../config/data_types";
import useMetadataStore from "../../stores/MetadataStore";
import type { NodeMetadata } from "../../stores/ApiTypes";
import NodeToolsSelector from "../chat/composer/NodeToolsSelector";

const ToolsListProperty = (props: PropertyProps) => {
  const id = `tools-list-${props.property.name}-${props.propertyIndex}`;
  const toolNames: string[] = useMemo(
    () => props.value?.map((tool: any) => tool.name) || [],
    [props.value]
  );

  const metadata = useMetadataStore((state) => state.metadata);

  const onChange = useCallback(
    (selectedToolNames: string[]) => {
      props.onChange(
        selectedToolNames.map((name) => ({ type: "tool_name", name }))
      );
    },
    [props]
  );

  const selectedNodeMetas: NodeMetadata[] = useMemo(
    () =>
      toolNames
        .map((nodeType) => metadata[nodeType])
        .filter(Boolean) as NodeMetadata[],
    [toolNames, metadata]
  );

  const handleToggleTool = useCallback(
    (toolName: string) => {
      const newToolNames = toolNames.includes(toolName)
        ? toolNames.filter((name) => name !== toolName)
        : [...toolNames, toolName];
      onChange(newToolNames);
    },
    [toolNames, onChange]
  );

  return (
    <>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />

      {/* Selected tools row */}
      <Stack
        className="tools-list-items"
        direction="row"
        spacing={1}
        flexWrap="wrap"
        sx={{ mt: 1 }}
      >
        {selectedNodeMetas.map((node) => {
          const outputType =
            node.outputs && node.outputs.length > 0
              ? node.outputs[0].type.type
              : "notype";
          return (
            <Tooltip key={node.node_type} title={node.title} placement="top">
              <IconButton
                size="small"
                onClick={() => handleToggleTool(node.node_type)}
                sx={{
                  padding: "1px",
                  marginLeft: "0 !important",
                  transition: "color 0.2s ease",
                  color: "c_hl1",
                  "&:hover": {
                    color: "c_hl1"
                  },
                  "& svg": {
                    fontSize: "12px"
                  }
                }}
              >
                <IconForType
                  iconName={outputType}
                  containerStyle={{ width: 16, height: 16 }}
                  bgStyle={{ width: 16, height: 16 }}
                  svgProps={{ width: 12, height: 12 }}
                />
              </IconButton>
            </Tooltip>
          );
        })}

        <NodeToolsSelector value={toolNames} onChange={onChange} />
      </Stack>
    </>
  );
};

export default memo(ToolsListProperty, isEqual);
