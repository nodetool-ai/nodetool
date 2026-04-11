/** @jsxImportSource @emotion/react */
import React, { useCallback, memo } from "react";
import { PropertyProps } from "../node/PropertyInput";
import PropertyLabel from "../node/PropertyLabel";
import ColorPicker from "../inputs/ColorPicker";
import isEqual from "fast-deep-equal";
import { useTheme } from "@mui/material/styles";
import { FlexRow } from "../ui_primitives";

const ColorProperty: React.FC<PropertyProps> = ({
  property,
  value,
  propertyIndex,
  onChange
}) => {
  const theme = useTheme();
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
      <FlexRow
        align="center"
        gap={2}
      >
        <ColorPicker
          color={color}
          onColorChange={handleColorChange}
          showCustom={true}
          isNodeProperty={true}
        />

        <span
          css={{
            color: theme.vars.palette.grey[400],
            fontSize: theme.fontSizeNormal
          }}
        >
          {color || "No color selected"}
        </span>
      </FlexRow>
    </div>
  );
};

export default memo(ColorProperty, isEqual);
