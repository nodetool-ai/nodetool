/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  Button,
  Checkbox,
  Typography,
  Box,
  Chip,
  Tooltip,
  Popover,
  PopoverOrigin
} from "@mui/material";
import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import LibraryBooksOutlinedIcon from "@mui/icons-material/LibraryBooksOutlined";
import { useCollectionStore } from "../../../stores/CollectionStore";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

// Popover dimensions
const POPOVER_WIDTH = 320;
const POPOVER_HEIGHT = 380;

const styles = (theme: Theme) => css({
  ".collections-list": {
    flex: 1,
    overflow: "auto",
    padding: "8px"
  },
  ".collection-item": {
    display: "flex",
    alignItems: "center",
    padding: "6px 8px",
    borderRadius: 6,
    cursor: "pointer",
    borderLeft: "3px solid transparent",
    marginBottom: "2px",
    "&:hover": {
      backgroundColor: theme.vars.palette.action.hover
    },
    "&.selected": {
      backgroundColor: theme.vars.palette.action.selected,
      borderLeft: `3px solid ${theme.vars.palette.primary.main}`
    }
  },
  ".checkbox-label": {
    margin: 0,
    width: "100%",
    "& .MuiFormControlLabel-label": {
      flex: 1
    }
  }
});

interface CollectionsSelectorProps {
  value: string[];
  onChange: (collections: string[]) => void;
}

const CollectionsSelector: React.FC<CollectionsSelectorProps> = ({
  value,
  onChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const theme = useTheme();
  const collections = useCollectionStore((state) => state.collections);
  const fetchCollections = useCollectionStore((state) => state.fetchCollections);
  const isLoading = useCollectionStore((state) => state.isLoading);

  useEffect(() => {
    if (!collections) {
      fetchCollections();
    }
  }, [collections, fetchCollections]);

  const handleClick = useCallback(() => {
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleToggle = useCallback(
    (collectionName: string) => {
      const newValue = value.includes(collectionName)
        ? value.filter((name) => name !== collectionName)
        : [...value, collectionName];
      onChange(newValue);
    },
    [value, onChange]
  );

  const handleSelectAll = useCallback(() => {
    if (collections?.collections) {
      onChange(collections.collections.map((c) => c.name));
    }
  }, [collections, onChange]);

  const handleClearAll = useCallback(() => {
    onChange([]);
  }, [onChange]);

  const selectedCount = value.length;
  const totalCount = collections?.collections?.length || 0;

  // Positioning logic for Popover
  const [positionConfig, setPositionConfig] = useState<{
    anchorOrigin: PopoverOrigin;
    transformOrigin: PopoverOrigin;
  }>({
    anchorOrigin: { vertical: "bottom", horizontal: "left" },
    transformOrigin: { vertical: "top", horizontal: "left" }
  });

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) {
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;

    if (spaceBelow < POPOVER_HEIGHT && rect.top > POPOVER_HEIGHT) {
      setPositionConfig({
        anchorOrigin: { vertical: "top", horizontal: "left" },
        transformOrigin: { vertical: "bottom", horizontal: "left" }
      });
    } else {
      setPositionConfig({
        anchorOrigin: { vertical: "bottom", horizontal: "left" },
        transformOrigin: { vertical: "top", horizontal: "left" }
      });
    }
  }, []);

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener("resize", updatePosition);
      return () => window.removeEventListener("resize", updatePosition);
    }
  }, [isOpen, updatePosition]);

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
          ref={buttonRef}
          className={`collections-button ${selectedCount > 0 ? "active" : ""}`}
          onClick={handleClick}
          size="small"
          startIcon={<LibraryBooksOutlinedIcon sx={{ fontSize: 18 }} />}
          endIcon={
            selectedCount > 0 && (
              <Chip
                size="small"
                label={selectedCount}
                sx={{
                  marginLeft: "-4px",
                  backgroundColor: theme.vars.palette.grey[700],
                  color: theme.vars.palette.grey[200],
                  borderRadius: "6px",
                  height: "18px",
                  "& .MuiChip-label": {
                    padding: "0 5px",
                    fontSize: "0.7rem"
                  }
                }}
              />
            )
          }
          sx={(theme) => ({
            color: theme.vars.palette.grey[0],
            padding: "0.25em 0.75em",
            "&:hover": {
              backgroundColor: theme.vars.palette.grey[500]
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

      <Popover
        css={styles(theme)}
        open={isOpen}
        anchorEl={buttonRef.current}
        onClose={handleClose}
        anchorOrigin={positionConfig.anchorOrigin}
        transformOrigin={positionConfig.transformOrigin}
        slotProps={{
          paper: {
            elevation: 24,
            style: {
              width: `${POPOVER_WIDTH}px`,
              height: `${POPOVER_HEIGHT}px`,
              maxHeight: "90vh",
              maxWidth: "100vw",
              borderRadius: theme.vars.rounded.dialog,
              background: theme.vars.palette.background.paper,
              border: `1px solid ${theme.vars.palette.divider}`,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden"
            }
          }
        }}
      >
        {/* Header */}
        <Box
          sx={{
            p: 1.5,
            pl: 2,
            borderBottom: `1px solid ${theme.vars.palette.divider}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
            background: theme.vars.palette.background.paper
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography
              variant="subtitle2"
              sx={{
                color: theme.vars.palette.text.secondary,
                fontWeight: 600,
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: 0.5
              }}
            >
              Collections
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: theme.vars.palette.text.secondary }}
            >
              {selectedCount}/{totalCount}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 0.5 }}>
            <Button
              size="small"
              onClick={handleSelectAll}
              sx={{ fontSize: "0.7rem", minWidth: "auto", px: 1 }}
            >
              All
            </Button>
            <Button
              size="small"
              onClick={handleClearAll}
              sx={{ fontSize: "0.7rem", minWidth: "auto", px: 1 }}
            >
              Clear
            </Button>
          </Box>
        </Box>

        {/* Collections List */}
        <Box className="collections-list">
          {isLoading ? (
            <Typography
              variant="body2"
              sx={{ p: 2, color: theme.vars.palette.text.secondary }}
            >
              Loading collections...
            </Typography>
          ) : !collections?.collections?.length ? (
            <Box sx={{ p: 2, color: theme.vars.palette.text.secondary }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                No collections available
              </Typography>
              <Typography variant="caption" sx={{ display: "block", opacity: 0.8, mb: 1 }}>
                Collections are vector databases used for semantic search during chat.
                When selected, relevant document chunks are retrieved and included as context.
              </Typography>
              <Typography variant="caption" sx={{ display: "block", opacity: 0.8 }}>
                Create a collection from the left sidebar, then add documents, PDFs, or text files to index them.
              </Typography>
            </Box>
          ) : (
            collections.collections.map((collection) => {
              const isSelected = value.includes(collection.name);
              return (
                <Box
                  key={collection.name}
                  className={`collection-item ${isSelected ? "selected" : ""}`}
                  onClick={() => handleToggle(collection.name)}
                >
                  <Checkbox
                    checked={isSelected}
                    size="small"
                    sx={{
                      padding: 0.5,
                      mr: 1,
                      color: theme.vars.palette.text.secondary,
                      "&.Mui-checked": {
                        color: theme.vars.palette.primary.main
                      }
                    }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontSize: "0.8rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {collection.name}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: theme.vars.palette.text.secondary }}
                    >
                      {collection.count} items
                    </Typography>
                  </Box>
                </Box>
              );
            })
          )}
        </Box>
      </Popover>
    </>
  );
};

export default CollectionsSelector;
