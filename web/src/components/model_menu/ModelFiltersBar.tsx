/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";

import {
  ToolbarIconButton,
  Box,
  EditorMenu,
  EditorMenuItem,
  ListItemText
} from "../ui_primitives";
import StraightenIcon from "@mui/icons-material/Straighten";
import useModelFiltersStore, { SizeBucket } from "../../stores/ModelFiltersStore";
import { isProduction } from "../../lib/env";

const barStyles = css({
  display: "flex",
  gap: 0,
  alignItems: "center",
  flexWrap: "nowrap"
});

const sizeOptions: SizeBucket[] = [
  "1-2B",
  "3-7B",
  "8-15B",
  "16-34B",
  "35-70B",
  "70B+"
];

const ModelFiltersBar: React.FC = () => {
  const sizeBucket = useModelFiltersStore((state) => state.sizeBucket);
  const setSizeBucket = useModelFiltersStore((state) => state.setSizeBucket);

  // Local anchor for the persistent size menu
  const [sizeAnchor, setSizeAnchor] = React.useState<null | HTMLElement>(null);

  const openSize = Boolean(sizeAnchor);

  return (
    <Box css={barStyles} className="model-menu__filters-bar">
      {/* Size dropdown (single). Parameter-count buckets only describe local
          models, so the cloud version has nothing to filter. */}
      {!isProduction && (
        <>
          <ToolbarIconButton
            icon={<StraightenIcon fontSize="small" />}
            tooltip={sizeBucket ? `Size: ${sizeBucket}` : "Filter by size"}
            onClick={(e) => setSizeAnchor(e.currentTarget)}
            size="small"
            active={!!sizeBucket || openSize}
            nodrag={false}
          />
          <EditorMenu
            anchorEl={sizeAnchor}
            open={openSize}
            onClose={() => setSizeAnchor(null)}
            keepMounted
          >
            <EditorMenuItem
              onClick={(e) => {
                e.stopPropagation();
                setSizeBucket(null);
              }}
            >
              <ListItemText primary="Any size" />
            </EditorMenuItem>
            {sizeOptions.map((s) => (
              <EditorMenuItem
                key={s}
                onClick={(e) => {
                  e.stopPropagation();
                  setSizeBucket(s);
                }}
                selected={sizeBucket === s}
              >
                <ListItemText primary={s} />
              </EditorMenuItem>
            ))}
          </EditorMenu>
        </>
      )}
    </Box>
  );
};

export default ModelFiltersBar;
