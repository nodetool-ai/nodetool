/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import {
  Box,
  Tooltip,
  IconButton,
  Button,
  Menu,
  MenuItem,
  Checkbox,
  ListItemText
} from "@mui/material";
import useModelFiltersStore, {
  SizeBucket,
  TypeTag
} from "../../stores/ModelFiltersStore";
import ClearAllIcon from "@mui/icons-material/Backspace";

const barStyles = css({
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap"
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
  familiesList?: string[];
  quantList?: string[];
}

const ModelFiltersBar: React.FC<ModelFiltersBarProps> = ({
  familiesList = []
}) => {
  const {
    selectedTypes,
    sizeBucket,
    families,
    toggleType,
    setSizeBucket,
    toggleFamily,
    clearAll
  } = useModelFiltersStore();

  // Local anchors for persistent menus
  const [typeAnchor, setTypeAnchor] = React.useState<null | HTMLElement>(null);
  const [sizeAnchor, setSizeAnchor] = React.useState<null | HTMLElement>(null);
  const [familyAnchor, setFamilyAnchor] = React.useState<null | HTMLElement>(
    null
  );
  const openType = Boolean(typeAnchor);
  const openSize = Boolean(sizeAnchor);
  const openFamily = Boolean(familyAnchor);

  return (
    <Box css={barStyles} className="model-menu__filters-bar">
      {/* Type dropdown (multi) */}
      <Button
        size="small"
        variant="outlined"
        onClick={(e) => setTypeAnchor(e.currentTarget)}
      >
        {selectedTypes.length ? `Type (${selectedTypes.length})` : "Type"}
      </Button>
      <Menu
        anchorEl={typeAnchor}
        open={openType}
        onClose={() => setTypeAnchor(null)}
        keepMounted
      >
        {typeOptions.map((t) => (
          <MenuItem
            key={t}
            onClick={(e) => {
              e.stopPropagation();
              toggleType(t);
            }}
          >
            <Checkbox size="small" checked={selectedTypes.includes(t)} />
            <ListItemText primary={t} />
          </MenuItem>
        ))}
      </Menu>

      {/* Size dropdown (single) */}
      <Button
        size="small"
        variant="outlined"
        onClick={(e) => setSizeAnchor(e.currentTarget)}
      >
        {sizeBucket ? `Size (${sizeBucket})` : "Size"}
      </Button>
      <Menu
        anchorEl={sizeAnchor}
        open={openSize}
        onClose={() => setSizeAnchor(null)}
        keepMounted
      >
        <MenuItem
          onClick={(e) => {
            e.stopPropagation();
            setSizeBucket(null);
          }}
        >
          <ListItemText primary="Any size" />
        </MenuItem>
        {sizeOptions.map((s) => (
          <MenuItem
            key={s}
            onClick={(e) => {
              e.stopPropagation();
              setSizeBucket(s);
            }}
            selected={sizeBucket === s}
          >
            <ListItemText primary={s} />
          </MenuItem>
        ))}
      </Menu>

      {/* Family dropdown (multi) */}
      <Button
        size="small"
        variant="outlined"
        onClick={(e) => setFamilyAnchor(e.currentTarget)}
      >
        {families.length ? `Family (${families.length})` : "Family"}
      </Button>
      <Menu
        anchorEl={familyAnchor}
        open={openFamily}
        onClose={() => setFamilyAnchor(null)}
        keepMounted
      >
        {familiesList.map((f) => (
          <MenuItem
            key={f}
            onClick={(e) => {
              e.stopPropagation();
              toggleFamily(f);
            }}
          >
            <Checkbox size="small" checked={families.includes(f)} />
            <ListItemText primary={f} />
          </MenuItem>
        ))}
      </Menu>

      <Tooltip title="Clear all filters">
        <span>
          <IconButton size="small" onClick={clearAll}>
            <ClearAllIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
};

export default ModelFiltersBar;
