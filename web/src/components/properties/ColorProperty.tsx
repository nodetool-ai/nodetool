/** @jsxImportSource @emotion/react */
import React, { useCallback, memo } from "react";
import { PropertyProps } from "../node/PropertyInput";
import PropertyLabel from "../node/PropertyLabel";
import ColorPicker from "../inputs/ColorPicker";
import { isEqual } from "lodash";
import { Box } from "@mui/material";

const ColorProperty: React.FC<PropertyProps> = ({
  property,
  value,
  propertyIndex,
  onChange
}) => {
  const handleColorChange = useCallback(
    (newColor: string | null) => {
      onChange({ type: "color", value: newColor });
    },
    [onChange]
  );

  const color = value?.value;

  return (
    <div className="property-wrapper">
      <PropertyLabel
        name={property.name}
        description={property.description}
        id={propertyIndex}
      />
      <div
        css={{
          display: "flex",
          alignItems: "center",
          gap: "8px"
        }}
      >
        <ColorPicker
          color={color}
          onColorChange={handleColorChange}
          showCustom={true}
          size="small"
        />
        <Box
          css={{
            backgroundColor: color || "#f0f0f0",
            border: color ? "1px solid rgba(0,0,0,0.1)" : "none",
            borderRadius: "4px",
            minWidth: "16px",
            maxWidth: "16px",
            height: "16px",
            display: "flex"
          }}
        />
        <span css={{ color: "#666", fontSize: "0.875em" }}>
          {color || "No color selected"}
        </span>
      </div>
    </div>
  );
};

export default memo(ColorProperty, isEqual);
