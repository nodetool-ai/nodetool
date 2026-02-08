import { memo, useCallback, useMemo, useState, useEffect, useRef } from "react";
import NumberInput from "../inputs/NumberInput";
import { PropertyProps } from "../node/PropertyInput";
import PropertyLabel from "../node/PropertyLabel";
import isEqual from "lodash/isEqual";
import { Box, IconButton, Menu, MenuItem, ListSubheader, TextField, InputAdornment } from "@mui/material";
import { IMAGE_SIZE_PRESETS as PRESETS } from "../../config/constants";
import Lock from "@mui/icons-material/Lock";
import LockOpen from "@mui/icons-material/LockOpen";
import MoreVert from "@mui/icons-material/MoreVert";
import Search from "@mui/icons-material/Search";
import { useNodes } from "../../contexts/NodeContext";

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

  // Ensure value is an object with defaults
  const safeValue: ImageSizeValue = (typeof value === 'object' && value !== null) 
    ? value 
    : { width: 1024, height: 1024 };

  const [locked, setLocked] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(1);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const valueRef = useRef(safeValue);
  valueRef.current = safeValue;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const ratioRef = useRef(aspectRatio);
  ratioRef.current = aspectRatio;

  // No need for aspectRatio state that can get stale, just use safeValue directly in handlers if possible,
  // or ensure handlers close over the latest safeValue.
  // Actually, keeping the ratio captured at lock time is standard, but we must ensure
  // the handlers see it.

  useEffect(() => {
    // Keep ratio in sync while NOT locked
    if (!locked && safeValue.width && safeValue.height) {
        setAspectRatio(safeValue.width / safeValue.height);
    }
  }, [safeValue.width, safeValue.height, locked]); 

  const toggleLock = () => {
    // Ensure we have current ratio right when locking
    if (!locked && safeValue.width && safeValue.height) {
        setAspectRatio(safeValue.width / safeValue.height);
    }
    setLocked(!locked);
  };

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

  const handlePresetClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
    setSearchQuery("");
  };

  const handlePresetSelect = (preset: typeof PRESETS[0]) => {
    onChange({ ...safeValue, width: preset.width, height: preset.height, preset: preset.label });
    if (locked) {
        setAspectRatio(preset.width / preset.height);
    }
    handleClose();
  };

  // Group and filter presets
  const filteredGroupedPresets = useMemo(() => {
    const query = searchQuery.toLowerCase();
    const groups: Record<string, typeof PRESETS> = {};
    
    PRESETS.forEach(preset => {
      const match = preset.label.toLowerCase().includes(query) || 
                   (preset.description?.toLowerCase().includes(query)) ||
                   (preset.aspectRatio?.toLowerCase().includes(query));
      
      if (match) {
        const category = preset.category || "Other";
        if (!groups[category]) groups[category] = [];
        groups[category].push(preset);
      }
    });
    return groups;
  }, [searchQuery]);

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
        <Box className="icon-container" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: -2 }}>  
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

        <Menu
          className="presets-menu"
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleClose}
          disableAutoFocusItem
          
          MenuListProps={{
            sx: { padding: 0 }
          }}
          PaperProps={{
            sx: {
              maxHeight: 450,
              width: '300px',
              backgroundColor: 'background.paper',
              '& .MuiListSubheader-root': {
                lineHeight: '32px',
                backgroundColor: '#1E1E1E', 
                backgroundImage: 'none', 
                fontWeight: 'bold',
                color: 'primary.light',
                position: 'sticky',
                top: '48px', // Match search box height
                zIndex: 10,  
              }
            }
          }}
        >
          {/* Header/Search Box - Sticky within the list */}
          <Box className="presets-search-container" sx={{ 
            p: 1, 
            position: 'sticky', 
            top: 0, 
            backgroundColor: '#1E1E1E', 
            zIndex: 11, 
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            height: '48px', 
            display: 'flex',
            alignItems: 'center',
            boxSizing: 'border-box'
          }}>
            <TextField
              className="presets-search-field"
              fullWidth
              size="small"
              placeholder="Search presets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              autoFocus
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search sx={{ fontSize: '1rem' }} />
                  </InputAdornment>
                ),
                sx: { 
                    fontSize: '0.8125rem',
                    height: '32px',
                    '& .MuiInputBase-input': {
                        py: 0
                    }
                }
              }}
            />
          </Box>

          {Object.entries(filteredGroupedPresets).length === 0 ? (
            <MenuItem disabled sx={{ fontSize: '0.8125rem' }}>No presets found</MenuItem>
          ) : (
            Object.entries(filteredGroupedPresets).map(([category, items]) => [
              <ListSubheader key={category} className="presets-category-header">{category}</ListSubheader>,
              ...items.map((preset) => (
                <MenuItem 
                  className="preset-menu-item"
                  key={`${preset.width}x${preset.height}-${preset.label}`}
                  onClick={() => handlePresetSelect(preset)}
                  selected={safeValue.width === preset.width && safeValue.height === preset.height}
                  sx={{ py: 0.5, px: 2 }}
                >
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Box sx={{ fontSize: '0.875rem' }}>{preset.label} {preset.aspectRatio}</Box>
                    {preset.description && (
                      <Box sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{preset.description}</Box>
                    )}
                  </Box>
                </MenuItem>
              ))
            ])
          )}
        </Menu>
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
