/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  Checkbox,
  Box,
  Popover,
  PopoverOrigin
} from "@mui/material";
import React, { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from "react";
import LibraryBooksOutlinedIcon from "@mui/icons-material/LibraryBooksOutlined";
import { useCollectionStore } from "../../../stores/CollectionStore";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { ScrollArea, Tooltip, Text, Caption, FlexRow, FlexColumn, EditorButton, Chip } from "../../ui_primitives";

// Popover dimensions
const POPOVER_WIDTH = 320;
const POPOVER_HEIGHT = 380;

const styles = (theme: Theme) => css({
  ".collections-list": {
    flex: 1,
    padding: "8px"
  },
  ".collection-item": {
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

  // Memoize toggle handlers for each collection to prevent re-renders
  const toggleHandlers = useMemo(() => {
    const handlers: Record<string, () => void> = {};
    if (collections?.collections) {
      for (const collection of collections.collections) {
        handlers[collection.name] = () => handleToggle(collection.name);
      }
    }
    return handlers;
  }, [collections, handleToggle]);

  const handleSelectAll = useCallback(() => {
    if (collections?.collections) {
      onChange(collections.collections.map((c: { name: string }) => c.name));
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
        delay={TOOLTIP_ENTER_DELAY}
      >
        <EditorButton
          ref={buttonRef}
          className={`collections-button ${selectedCount > 0 ? "active" : ""}`}
          onClick={handleClick}
          density="compact"
          startIcon={<LibraryBooksOutlinedIcon sx={{ fontSize: 18 }} />}
          endIcon={
            selectedCount > 0 && (
              <Chip
                label={selectedCount}
                compact
                sx={{
                  marginLeft: "-4px",
                  backgroundColor: theme.vars.palette.grey[700],
                  color: theme.vars.palette.grey[200],
                  borderRadius: "var(--rounded-md)",
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
              overflow: "hidden"
            }
          }
        }}
      >
        <FlexColumn
          sx={{
            width: `${POPOVER_WIDTH}px`,
            height: `${POPOVER_HEIGHT}px`,
            maxHeight: "90vh",
            maxWidth: "100vw",
            overflow: "hidden"
          }}
        >
          {/* Header */}
          <FlexRow
            align="center"
            justify="space-between"
            sx={{
              p: 1.5,
              pl: 2,
              borderBottom: `1px solid ${theme.vars.palette.divider}`,
              flexShrink: 0,
              background: theme.vars.palette.background.paper
            }}
          >
            <FlexRow gap={1} align="center">
              <Text
                size="small"
                weight={600}
                color="secondary"
                sx={{
                  fontSize: "0.75rem",
                  textTransform: "uppercase",
                  letterSpacing: 0.5
                }}
              >
                Collections
              </Text>
              <Caption>
                {selectedCount}/{totalCount}
              </Caption>
            </FlexRow>
            <FlexRow gap={0.5}>
              <EditorButton
                density="compact"
                onClick={handleSelectAll}
                sx={{ fontSize: "0.7rem", minWidth: "auto", px: 1 }}
              >
                All
              </EditorButton>
              <EditorButton
                density="compact"
                onClick={handleClearAll}
                sx={{ fontSize: "0.7rem", minWidth: "auto", px: 1 }}
              >
                Clear
              </EditorButton>
            </FlexRow>
          </FlexRow>

          {/* Collections List */}
          <ScrollArea className="collections-list" fullHeight sx={{ flex: 1, minHeight: 0 }}>
            {isLoading ? (
              <Text
                size="small"
                color="secondary"
                sx={{ p: 2 }}
              >
                Loading collections...
              </Text>
            ) : !collections?.collections.length ? (
              <Box sx={{ p: 2, color: theme.vars.palette.text.secondary }}>
                <Text size="small" sx={{ mb: 1 }}>
                  No collections available
                </Text>
                <Caption sx={{ display: "block", opacity: 0.8, mb: 1 }}>
                  Collections are vector databases used for semantic search during chat.
                  When selected, relevant document chunks are retrieved and included as context.
                </Caption>
                <Caption sx={{ display: "block", opacity: 0.8 }}>
                  Create a collection from the left sidebar, then add documents, PDFs, or text files to index them.
                </Caption>
              </Box>
            ) : (
              collections.collections.map((collection: { name: string; count: number }) => {
                const isSelected = value.includes(collection.name);
                return (
                  <FlexRow
                    key={collection.name}
                    className={`collection-item ${isSelected ? "selected" : ""}`}
                    onClick={toggleHandlers[collection.name]}
                    align="center"
                    fullWidth
                    sx={{
                      p: "6px 8px",
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
                    }}
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
                    <FlexColumn sx={{ flex: 1, minWidth: 0 }}>
                      <Text
                        size="small"
                        truncate
                        sx={{ fontSize: "0.8rem" }}
                      >
                        {collection.name}
                      </Text>
                      <Caption>
                        {collection.count} items
                      </Caption>
                    </FlexColumn>
                  </FlexRow>
                );
              })
            )}
          </ScrollArea>
        </FlexColumn>
      </Popover>
    </>
  );
};

export default CollectionsSelector;
