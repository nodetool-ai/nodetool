import { memo, useCallback } from "react";
import NumberInput from "../inputs/NumberInput";
import { PropertyProps } from "../node/PropertyInput";
import isEqual from "lodash/isEqual";
import { NodeTextField } from "../editor_ui";
import PropertyLabel from "../node/PropertyLabel";
import { Box } from "@mui/material";

type ImageSizeValue = {
  width: number;
  height: number;
  preset?: string;
};

const ImageSizeProperty = (props: PropertyProps) => {
  const { property, nodeId, value, onChange, tabIndex } = props;
  
  // Ensure value is an object with defaults
  const safeValue: ImageSizeValue = (typeof value === 'object' && value !== null) 
    ? value 
    : { width: 1024, height: 1024 };

  const handleWidthChange = useCallback((_: any, val: number) => {
    onChange({ ...safeValue, width: val });
  }, [onChange, safeValue]);

  const handleHeightChange = useCallback((_: any, val: number) => {
    onChange({ ...safeValue, height: val });
  }, [onChange, safeValue]);

  const handlePresetChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange({ ...safeValue, preset: val || undefined });
  }, [onChange, safeValue]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
       <PropertyLabel 
         name={property.name} 
         description={property.description} 
         id={property.name} 
       />
       <Box sx={{ display: 'flex', gap: 1 }}>
         <Box sx={{ flex: 1 }}>
            <NumberInput 
                id={`${nodeId}-${property.name}-width`}
                nodeId={nodeId}
                name="Width"
                value={safeValue.width}
                onChange={handleWidthChange}
                min={1}
                inputType="int"
                size="small"
                tabIndex={tabIndex}
            />
         </Box>
         <Box sx={{ flex: 1 }}>
            <NumberInput 
                id={`${nodeId}-${property.name}-height`}
                nodeId={nodeId}
                name="Height"
                value={safeValue.height}
                onChange={handleHeightChange}
                min={1}
                inputType="int"
                size="small"
                tabIndex={tabIndex}
            />
         </Box>
       </Box>
       <NodeTextField 
          value={safeValue.preset || ""}
          onChange={handlePresetChange}
          placeholder="Preset (optional)"
          fullWidth
          tabIndex={tabIndex}
       />
    </Box>
  );
};

export default memo(ImageSizeProperty, isEqual);
