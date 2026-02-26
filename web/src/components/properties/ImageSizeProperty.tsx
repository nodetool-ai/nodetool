import { memo, useCallback, useMemo, useState, useEffect, useRef } from "react";
import NumberInput from "../inputs/NumberInput";
import { PropertyProps } from "../node/PropertyInput";
import PropertyLabel from "../node/PropertyLabel";
import isEqual from "lodash/isEqual";
import { Box, IconButton } from "@mui/material";
import { IMAGE_SIZE_PRESETS as PRESETS } from "../../config/constants";
import Lock from "@mui/icons-material/Lock";
import LockOpen from "@mui/icons-material/LockOpen";
import MoreVert from "@mui/icons-material/MoreVert";
import SwapHoriz from "@mui/icons-material/SwapHoriz";
import { useNodes } from "../../contexts/NodeContext";
import { ImageSizePresetsMenu } from "./ImageSizePresetsMenu";

type ImageSizeValue = {
  width: number;
  height: number;
  preset?: string;
};

const ImageSizeProperty = (props: PropertyProps) => {
  const { property, nodeId, value, onChange, tabIndex } = props;

  // Check if connected
  const isConnected = useNodes((state) => {
    return state.edges.some(
      (edge) => edge.target === nodeId && edge.targetHandle === property.name
    );
  });

  // Ensure value is an object with defaults - memoized to prevent useCallback dependency changes
  const safeValue: ImageSizeValue = useMemo(() => {
    return (typeof value === 'object' && value !== null)
      ? value
      : { width: 1024, height: 1024 };
  }, [value]);

  const [locked, setLocked] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(1);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const valueRef = useRef(safeValue);
  valueRef.current = safeValue;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const ratioRef = useRef(aspectRatio);
  ratioRef.current = aspectRatio;

  useEffect(() => {
    // Keep ratio in sync while NOT locked
    if (!locked && safeValue.width && safeValue.height) {
        setAspectRatio(safeValue.width / safeValue.height);
    }
  }, [safeValue.width, safeValue.height, locked]);

  const toggleLock = useCallback(() => {
    // Ensure we have current ratio right when locking
    if (!locked && safeValue.width && safeValue.height) {
        setAspectRatio(safeValue.width / safeValue.height);
    }
    setLocked(!locked);
  }, [locked, safeValue.width, safeValue.height]);

  const handleWidthChange = useCallback((_: any, val: number) => {
    const current = valueRef.current;
    if (lockedRef.current) {
        const newHeight = Math.round(val / ratioRef.current);
        onChange({ ...current, width: val, height: newHeight, preset: undefined });
    } else {
        onChange({ ...current, width: val, preset: undefined });
    }
  }, [onChange]);

  const handleHeightChange = useCallback((_: any, val: number) => {
    const current = valueRef.current;
    if (lockedRef.current) {
        const newWidth = Math.round(val * ratioRef.current);
        onChange({ ...current, height: val, width: newWidth, preset: undefined });
    } else {
        onChange({ ...current, height: val, preset: undefined });
    }
  }, [onChange]);

  const handlePresetClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handlePresetSelect = useCallback((preset: typeof PRESETS[0]) => {
    onChange({ ...safeValue, width: preset.width, height: preset.height, preset: preset.label });
    if (locked) {
        setAspectRatio(preset.width / preset.height);
    }
    handleClose();
  }, [safeValue, locked, onChange, handleClose]);

  const handleSwap = useCallback(() => {
    const newWidth = safeValue.height;
    const newHeight = safeValue.width;
    onChange({ ...safeValue, width: newWidth, height: newHeight, preset: undefined });
    if (locked) {
        setAspectRatio(newWidth / newHeight);
    }
  }, [safeValue, locked, onChange]);

  // Find matching preset
  const matchedPreset = useMemo(() => {
    return PRESETS.find(p => p.width === safeValue.width && p.height === safeValue.height);
  }, [safeValue.width, safeValue.height]);

  const id = `image-size-${property.name}-${nodeId}`;

  if (isConnected) {
    return (
      <PropertyLabel
        name={property.name}
        description={property.description}
        id={id}
      />
    );
  }

  return (
    <Box className="image-size-property-container" sx={{ display: 'flex', flexDirection: 'column', width: '100%', overflow: "hidden" }}>
      <PropertyLabel
        name={property.name}
        description={property.description}
        id={id}
      />
      <Box className="image-size-property" sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', mt: 0.5 }}>
        <Box className="width-input-container" sx={{ width: '70px', mr: 4 }}>
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
              hideLabel={false}
          />
        </Box>
        
        <Box className="height-input-container" sx={{ width: '70px' }}>
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
              hideLabel={false}
          />
        </Box>

        <Box className="spacer" sx={{ flex: 1 }} />
        <Box className="icon-container" sx={{ display: 'flex', alignItems: 'center', gap: 0, mt: -2 }}>  
          <IconButton 
            className="aspect-swap-button"
            onClick={handleSwap} 
            size="small" 
            sx={{ 
                p: 0.5,
                color: 'text.secondary',
                alignSelf: 'center',
            }}
            title="Swap Width and Height"
          >
            <SwapHoriz sx={{ fontSize: '1.2rem' }} />
          </IconButton>

          <IconButton 
            className="aspect-lock-button"
            onClick={toggleLock} 
            size="small" 
            sx={{ 
                p: 0.5,
                color: locked ? 'primary.main' : 'text.secondary',
                alignSelf: 'center',
            }}
            title={locked ? "Unlock Aspect Ratio" : "Lock Aspect Ratio"}
          >
            {locked ? <Lock sx={{ fontSize: '1rem' }} /> : <LockOpen sx={{ fontSize: '1rem' }} />}
          </IconButton>

          <IconButton 
            className="presets-menu-button"
            onClick={handlePresetClick}
            size="small"
            sx={{ 
                p: 0.5,
                color: 'text.secondary',
                alignSelf: 'center',
            }}
            title="Presets"
          >
            <MoreVert sx={{ fontSize: '1.2rem' }} />
          </IconButton>
        </Box>

        <ImageSizePresetsMenu 
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleClose}
          onSelect={handlePresetSelect}
          currentWidth={safeValue.width}
          currentHeight={safeValue.height}
        />
      </Box>
      {matchedPreset && (
        <Box 
            className="matched-preset-label"
            sx={{ 
                fontSize: 'var(--fontSizeTiny)', 
                color: 'text.secondary', 
                mt: -0.5,
                lineHeight: 1,
                userSelect: 'none',
                pointerEvents: 'none'
            }}
        >
          {matchedPreset.label} {matchedPreset.aspectRatio}
        </Box>
      )}
    </Box>
  );
};

export default memo(ImageSizeProperty, isEqual);
