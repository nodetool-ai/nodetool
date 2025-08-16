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

  const onChange = useCallback(
    (selectedToolNames: string[]) => {
      props.onChange(
        selectedToolNames.map((name) => ({ type: "tool_name", name }))
      );
    },
    [props]
  );

  return (
    <>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      <NodeToolsSelector value={toolNames} onChange={onChange} />
    </>
  );
};

export default memo(ToolsListProperty, isEqual);
