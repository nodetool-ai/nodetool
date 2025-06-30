/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  Button,
  Menu,
  MenuItem,
  Checkbox,
  FormControlLabel,
  Typography,
  Box,
  Divider,
  IconButton,
  Chip,
  Tooltip
} from "@mui/material";
import React, { useState, useEffect } from "react";
import FolderIcon from "@mui/icons-material/Folder";
import { useCollectionStore } from "../../../stores/CollectionStore";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";

const styles = {
  menu: css({
    "& .MuiPaper-root": {
      minWidth: "250px",
      maxHeight: "400px",
      overflowY: "auto"
    }
  }),
  menuItem: css({
    padding: "4px 16px",
    "&:hover": {
      backgroundColor: "transparent"
    }
  }),
  checkboxLabel: css({
    margin: 0,
    width: "100%",
    "& .MuiCheckbox-root": {
      padding: "4px 8px"
    }
  })
};

interface CollectionsSelectorProps {
  value: string[];
  onChange: (collections: string[]) => void;
}

const CollectionsSelector: React.FC<CollectionsSelectorProps> = ({
  value,
  onChange
}) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const { collections, fetchCollections, isLoading } = useCollectionStore();

  useEffect(() => {
    if (!collections) {
      fetchCollections();
    }
  }, [collections, fetchCollections]);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleToggle = (collectionName: string) => {
    const newValue = value.includes(collectionName)
      ? value.filter((name) => name !== collectionName)
      : [...value, collectionName];
    onChange(newValue);
  };

  const handleSelectAll = () => {
    if (collections) {
      onChange(collections.collections.map((c) => c.name));
    }
  };

  const handleClearAll = () => {
    onChange([]);
  };

  const selectedCount = value.length;
  const totalCount = collections?.collections.length || 0;

  return (
    <>
      <Tooltip
        title={
          selectedCount > 0
            ? `${selectedCount} collection${
                selectedCount === 1 ? "" : "s"
              } selected`
            : "Select Collections"
        }
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <Button
          className={`collections-button ${selectedCount > 0 ? "active" : ""}`}
          onClick={handleClick}
          size="small"
          startIcon={<FolderIcon fontSize="small" />}
          endIcon={
            selectedCount > 0 && (
              <Chip
                size="small"
                label={selectedCount}
                sx={{
                  marginLeft: 1,
                  backgroundColor: "var(--palette-primary-main)",
                  color: "var(--c_black)",
                  "& .MuiChip-label": {
                    padding: "0 4px"
                  }
                }}
              />
            )
          }
          sx={(theme) => ({
            color: theme.palette.c_white,
            padding: "0.25em 0.75em",
            "&:hover": {
              backgroundColor: theme.palette.grey[500]
            },
            "&.active": {
              borderColor: "var(--palette-primary-main)",
              color: "var(--palette-primary-main)",
              "& .MuiSvgIcon-root": {
                color: "var(--palette-primary-main)"
              }
            }
          })}
        />
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        css={styles.menu}
      >
        <Box px={2} py={1}>
          <Typography variant="subtitle2" color="text.secondary">
            Select Collections
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {selectedCount} of {totalCount} selected
          </Typography>
        </Box>
        <Divider />
        <Box px={2} py={0.5}>
          <Button size="small" onClick={handleSelectAll} sx={{ mr: 1 }}>
            Select All
          </Button>
          <Button size="small" onClick={handleClearAll}>
            Clear All
          </Button>
        </Box>
        <Divider />
        {isLoading ? (
          <MenuItem disabled>
            <Typography variant="body2">Loading collections...</Typography>
          </MenuItem>
        ) : !collections?.collections.length ? (
          <MenuItem disabled>
            <Typography variant="body2">No collections available</Typography>
          </MenuItem>
        ) : (
          collections.collections.map((collection) => (
            <MenuItem
              key={collection.name}
              css={styles.menuItem}
              onClick={(e) => e.stopPropagation()}
            >
              <FormControlLabel
                control={
                  <Checkbox
                    checked={value.includes(collection.name)}
                    onChange={() => handleToggle(collection.name)}
                    size="small"
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2">{collection.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {collection.count} items
                    </Typography>
                  </Box>
                }
                css={styles.checkboxLabel}
              />
            </MenuItem>
          ))
        )}
      </Menu>
    </>
  );
};

export default CollectionsSelector;
