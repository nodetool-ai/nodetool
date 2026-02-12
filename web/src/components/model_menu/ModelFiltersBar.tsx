/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, memo } from "react";
import {
  Box,
  Menu,
  MenuItem,
  Checkbox,
  ListItemText,
  Tooltip,
  IconButton
} from "@mui/material";
import CategoryIcon from "@mui/icons-material/Category";
import StraightenIcon from "@mui/icons-material/Straighten";
import useModelFiltersStore, {
  SizeBucket,
  TypeTag
} from "../../stores/ModelFiltersStore";
import isEqual from "lodash/isEqual";


const barStyles = css({
  display: "flex",
  gap: 0,
  alignItems: "center",
  flexWrap: "nowrap"
});

const typeOptions: TypeTag[] = [
  "instruct",
  "chat",
  "base",
  "sft",
  "dpo",
  "reasoning",
  "code",
  "math"
];
const sizeOptions: SizeBucket[] = [
  "1-2B",
  "3-7B",
  "8-15B",
  "16-34B",
  "35-70B",
  "70B+"
];

interface ModelFiltersBarProps {
  quantList?: string[];
}

const ModelFiltersBar: React.FC<ModelFiltersBarProps> = () => {
  const selectedTypes = useModelFiltersStore((state) => state.selectedTypes);
  const sizeBucket = useModelFiltersStore((state) => state.sizeBucket);
  const toggleType = useModelFiltersStore((state) => state.toggleType);
  const setSizeBucket = useModelFiltersStore((state) => state.setSizeBucket);

  // Local anchors for persistent menus
  const [typeAnchor, setTypeAnchor] = React.useState<null | HTMLElement>(null);
  const [sizeAnchor, setSizeAnchor] = React.useState<null | HTMLElement>(null);

  const openType = Boolean(typeAnchor);
  const openSize = Boolean(sizeAnchor);

  const handleTypeClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    setTypeAnchor(e.currentTarget);
  }, []);

  const handleSizeClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    setSizeAnchor(e.currentTarget);
  }, []);

  const handleTypeClose = useCallback(() => {
    setTypeAnchor(null);
  }, []);

  const handleSizeClose = useCallback(() => {
    setSizeAnchor(null);
  }, []);

  const handleTypeToggle = useCallback((e: React.MouseEvent<HTMLElement>, type: TypeTag) => {
    e.stopPropagation();
    toggleType(type);
  }, [toggleType]);

  const handleSizeSet = useCallback((e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    setSizeBucket(null);
  }, [setSizeBucket]);

  const handleSizeSelect = useCallback((e: React.MouseEvent<HTMLElement>, size: SizeBucket) => {
    e.stopPropagation();
    setSizeBucket(size);
  }, [setSizeBucket]);

  return (
    <Box css={barStyles} className="model-menu__filters-bar">
      {/* Type dropdown (multi) */}
      <Tooltip title={selectedTypes.length ? `Type: ${selectedTypes.join(", ")}` : "Filter by Type"}>
        <IconButton
          onClick={handleTypeClick}
          size="small"
          color={selectedTypes.length || openType ? "primary" : "default"}
        >
          <CategoryIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={typeAnchor}
        open={openType}
        onClose={handleTypeClose}
        keepMounted
      >
        {typeOptions.map((t) => (
          <MenuItem
            key={t}
            onClick={(e) => handleTypeToggle(e, t)}
          >
            <Checkbox size="small" checked={selectedTypes.includes(t)} />
            <ListItemText primary={t} />
          </MenuItem>
        ))}
      </Menu>

      {/* Size dropdown (single) */}
      <Tooltip title={sizeBucket ? `Size: ${sizeBucket}` : "Filter by Size"}>
        <IconButton
          onClick={handleSizeClick}
          size="small"
          color={sizeBucket || openSize ? "primary" : "default"}
        >
          <StraightenIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={sizeAnchor}
        open={openSize}
        onClose={handleSizeClose}
        keepMounted
      >
        <MenuItem
          onClick={handleSizeSet}
        >
          <ListItemText primary="Any size" />
        </MenuItem>
        {sizeOptions.map((s) => (
          <MenuItem
            key={s}
            onClick={(e) => handleSizeSelect(e, s)}
            selected={sizeBucket === s}
          >
            <ListItemText primary={s} />
          </MenuItem>
        ))}
      </Menu>

    </Box>
  );
};

export default memo(ModelFiltersBar, isEqual);
