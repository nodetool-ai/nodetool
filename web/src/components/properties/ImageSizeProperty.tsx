import { memo, useCallback, useMemo, useState, useEffect } from "react";
import NumberInput from "../inputs/NumberInput";
import { PropertyProps } from "../node/PropertyInput";
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

  if (isConnected) {
    return null;
  }

  return (
    <Box className="image-size-property-container" sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
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
          PaperProps={{
            sx: {
              maxHeight: 450,
              width: '300px',
              backgroundColor: 'background.paper',
              '& .MuiList-root': {
                paddingTop: 0
              },
              '& .MuiListSubheader-root': {
                lineHeight: '32px',
                backgroundColor: '#1E1E1E', // Match theme background exactly
                backgroundImage: 'none', // Remove gradients that might cause transparency issues
                fontWeight: 'bold',
                color: 'primary.light',
                position: 'sticky',
                top: '56px', // Align below the search box
                zIndex: 10,  // Higher z-index to stay above menu items
              }
            }
          }}
        >
          <Box className="presets-search-container" sx={{ 
            p: 1, 
            position: 'sticky', 
            top: 0, 
            backgroundColor: '#1E1E1E', 
            zIndex: 11, 
            borderBottom: '1px solid rgba(255,255,255,0.1)' 
          }}>
            <TextField
              className="presets-search-field"
              fullWidth
              size="small"
              placeholder="Search presets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search sx={{ fontSize: '1rem' }} />
                  </InputAdornment>
                ),
                sx: { fontSize: '0.8125rem' }
              }}
            />
          </Box>
          <Box className="presets-list-container" sx={{ mt: 0 }}>
            {Object.entries(filteredGroupedPresets).length === 0 ? (
              <MenuItem disabled sx={{ fontSize: '0.8125rem' }}>No presets found</MenuItem>
            ) : (
              Object.entries(filteredGroupedPresets).map(([category, items]) => (
                <Box key={category} className="presets-category-group">
                  <ListSubheader className="presets-category-header">{category}</ListSubheader>
                  {items.map((preset) => (
                    <MenuItem 
                      className="preset-menu-item"
                      key={`${preset.width}x${preset.height}-${preset.label}`}
                      onClick={() => handlePresetSelect(preset)}
                      selected={safeValue.width === preset.width && safeValue.height === preset.height}
                      sx={{ py: 0.5 }}
                    >
                      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Box sx={{ fontSize: '0.875rem' }}>{preset.label} ({preset.aspectRatio})</Box>
                        {preset.description && (
                          <Box sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{preset.description}</Box>
                        )}
                      </Box>
                    </MenuItem>
                  ))}
                </Box>
              ))
            )}
          </Box>
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
          {matchedPreset.label}
        </Box>
      )}
    </Box>
  );
};

export default memo(ImageSizeProperty, isEqual);
