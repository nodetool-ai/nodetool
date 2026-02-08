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

import { IMAGE_SIZE_PRESETS as PRESETS, PresetOption } from "../../config/constants";
import Lock from "@mui/icons-material/Lock";
import LockOpen from "@mui/icons-material/LockOpen";
import { IconButton, Autocomplete, TextField } from "@mui/material";
import { useState, useEffect } from "react";



const ImageSizeProperty = (props: PropertyProps) => {
  const { property, nodeId, value, onChange, tabIndex } = props;
  
  // Ensure value is an object with defaults
  const safeValue: ImageSizeValue = (typeof value === 'object' && value !== null) 
    ? value 
    : { width: 1024, height: 1024 };

  const [locked, setLocked] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(1);

  useEffect(() => {
    if (safeValue.width && safeValue.height) {
        setAspectRatio(safeValue.width / safeValue.height);
    }
  }, []); 

  const toggleLock = () => {
    if (!locked) {
        setAspectRatio(safeValue.width / safeValue.height);
    }
    setLocked(!locked);
  };

  const handleWidthChange = useCallback((_: any, val: number) => {
    if (locked) {
        const newHeight = Math.round(val / aspectRatio);
        onChange({ ...safeValue, width: val, height: newHeight, preset: undefined });
    } else {
        onChange({ ...safeValue, width: val, preset: undefined });
    }
  }, [onChange, safeValue, locked, aspectRatio]);

  const handleHeightChange = useCallback((_: any, val: number) => {
    if (locked) {
        const newWidth = Math.round(val * aspectRatio);
        onChange({ ...safeValue, height: val, width: newWidth, preset: undefined });
    } else {
        onChange({ ...safeValue, height: val, preset: undefined });
    }
  }, [onChange, safeValue, locked, aspectRatio]);

  const handlePresetChange = useCallback((event: any, newValue: { label: string, width: number, height: number } | null) => {
    if (newValue) {
        onChange({ ...safeValue, width: newValue.width, height: newValue.height, preset: newValue.label });
        if (locked) {
            setAspectRatio(newValue.width / newValue.height);
        }
    } else {
        onChange({ ...safeValue, preset: undefined });
    }
  }, [onChange, safeValue, locked]);

  const currentPreset = PRESETS.find(p => p.width === safeValue.width && p.height === safeValue.height);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
       <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
         <Box sx={{ width: '80px', display: 'flex', flexDirection: 'column' }}>
            <NumberInput 
                id={`${nodeId}-${property.name}-width`}
                nodeId={nodeId}
                name="W"
                value={safeValue.width}
                onChange={handleWidthChange}
                min={1}
                inputType="int"
                size="small"
                tabIndex={tabIndex}
            />
         </Box>
         <Box sx={{ width: '80px', display: 'flex', flexDirection: 'column' }}>
            <NumberInput 
                id={`${nodeId}-${property.name}-height`}
                nodeId={nodeId}
                name="H"
                value={safeValue.height}
                onChange={handleHeightChange}
                min={1}
                inputType="int"
                size="small"
                tabIndex={tabIndex}
            />
         </Box>
         <Box sx={{ flex: 1 }} />
         <IconButton 
            onClick={toggleLock} 
            size="small" 
            sx={{ 
                p: 0,
                color: locked ? 'primary.main' : 'text.secondary',
                mb: 1
            }}
            title={locked ? "Unlock Aspect Ratio" : "Lock Aspect Ratio"}
         >
            {locked ? <Lock sx={{ fontSize: '1rem' }} /> : <LockOpen sx={{ fontSize: '1rem' }} />}
         </IconButton>
       </Box>
       <Box>
        <Autocomplete
            options={PRESETS}
            groupBy={(option) => option.category}
            getOptionLabel={(option) => {
                const parts = [option.label];
                if (option.aspectRatio) parts.push(`(${option.aspectRatio})`);
                if (option.description) parts.push(`- ${option.description}`);
                return parts.join(' ');
            }}
            value={currentPreset}
            onChange={handlePresetChange}
            isOptionEqualToValue={(option, value) => option.width === value.width && option.height === value.height}
            disableClearable
            componentsProps={{
                paper: {
                    sx: {
                        width: '350px',
                        '& .MuiAutocomplete-groupLabel': {
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            color: 'primary.light',
                            fontWeight: 'bold',
                            lineHeight: '32px'
                        }
                    }
                }
            }}
            renderInput={(params) => (
                <TextField 
                    {...params} 
                    placeholder="Select Preset" 
                    variant="outlined" 
                    size="small" 
                    fullWidth
                    sx={{
                        '& .MuiInputBase-root': {
                            fontSize: '0.8125rem',
                            paddingTop: '0px !important', 
                            paddingBottom: '0px !important',
                            minHeight: '28px'
                        },
                        '& .MuiOutlinedInput-notchedOutline': {
                           borderColor: 'rgba(255, 255, 255, 0.23)'
                        }
                    }}
                />
            )}
            size="small"
            sx={{ mt: 0 }}
        />
       </Box>
    </Box>
  );
};

export default memo(ImageSizeProperty, isEqual);
