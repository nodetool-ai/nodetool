/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import {
  Box,
  Menu,
  MenuItem,
  ListItemText
} from "@mui/material";
import { ToolbarIconButton, Checkbox } from "../ui_primitives";
import CategoryIcon from "@mui/icons-material/Category";
import StraightenIcon from "@mui/icons-material/Straighten";
import useModelFiltersStore, {
  SizeBucket,
  TypeTag
} from "../../stores/ModelFiltersStore";


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

  return (
    <Box css={barStyles} className="model-menu__filters-bar">
      {/* Type dropdown (multi) */}
      <ToolbarIconButton
        icon={<CategoryIcon fontSize="small" />}
        tooltip={selectedTypes.length ? `Type: ${selectedTypes.join(", ")}` : "Filter by Type"}
        onClick={(e) => setTypeAnchor(e.currentTarget)}
        size="small"
        active={selectedTypes.length > 0 || openType}
        nodrag={false}
      />
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
      <ToolbarIconButton
        icon={<StraightenIcon fontSize="small" />}
        tooltip={sizeBucket ? `Size: ${sizeBucket}` : "Filter by Size"}
        onClick={(e) => setSizeAnchor(e.currentTarget)}
        size="small"
        active={!!sizeBucket || openSize}
        nodrag={false}
      />
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

    </Box>
  );
};

export default ModelFiltersBar;
