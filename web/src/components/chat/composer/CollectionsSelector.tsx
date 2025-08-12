/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  Button,
  Checkbox,
  FormControlLabel,
  Typography,
  Box,
  Divider,
  IconButton,
  Chip,
  Tooltip,
  Dialog,
  DialogContent,
  DialogTitle
} from "@mui/material";
import React, { useState, useEffect } from "react";
import FolderIcon from "@mui/icons-material/Folder";
import CloseIcon from "@mui/icons-material/Close";
import { useCollectionStore } from "../../../stores/CollectionStore";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";

const styles = {
  dialog: css({
    ".dialog-title": {
      position: "sticky",
      top: 0,
      zIndex: 2,
      background: "transparent",
      margin: 0,
      padding: "24px 32px",
      borderBottom: "1px solid var(--palette-grey-700)"
    },
    ".close-button": {
      position: "absolute",
      right: 8,
      top: 12,
      color: "var(--palette-grey-500)"
    },
    ".dialog-summary": {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 16px",
      color: "var(--palette-grey-200)"
    },
    ".actions": {
      padding: "8px 16px",
      display: "flex",
      gap: 8
    },
    ".collections-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
      gap: 12,
      padding: "8px 8px 16px"
    },
    ".collection-item": {
      border: "1px solid var(--palette-grey-700)",
      borderRadius: 8,
      background: "transparent",
      padding: 8
    },
    ".checkbox-label": {
      margin: 0,
      width: "100%"
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
  const [isOpen, setIsOpen] = useState(false);
  const { collections, fetchCollections, isLoading } = useCollectionStore();

  useEffect(() => {
    if (!collections) {
      fetchCollections();
    }
  }, [collections, fetchCollections]);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
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
                  color: "var(--palette-grey-1000)",
                  "& .MuiChip-label": {
                    padding: "0 4px"
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
      <Dialog
        css={styles.dialog}
        className="collections-selector-dialog"
        open={isOpen}
        onClose={handleClose}
        aria-labelledby="collections-selector-title"
        slotProps={{
          backdrop: { style: { backdropFilter: "blur(20px)" } }
        }}
        sx={(theme) => ({
          "& .MuiDialog-paper": {
            width: "92%",
            maxWidth: "1000px",
            margin: "auto",
            borderRadius: 1.5,
            background: "transparent",
            border: `1px solid ${theme.vars.palette.grey[700]}`
          }
        })}
      >
        <DialogTitle className="dialog-title">
          <Typography variant="h4" id="collections-selector-title">
            Collections
          </Typography>
          <Tooltip title="Close">
            <IconButton
              aria-label="close"
              onClick={handleClose}
              className="close-button"
            >
              <CloseIcon />
            </IconButton>
          </Tooltip>
        </DialogTitle>
        <DialogContent sx={{ background: "transparent", pt: 2 }}>
          <Box className="dialog-summary">
            <Typography variant="subtitle2">
              {selectedCount} of {totalCount} selected
            </Typography>
          </Box>
          <Box className="actions">
            <Button size="small" onClick={handleSelectAll} sx={{ mr: 1 }}>
              Select All
            </Button>
            <Button size="small" onClick={handleClearAll}>
              Clear All
            </Button>
          </Box>
          <Divider />
          <div className="collections-grid">
            {isLoading ? (
              <Typography variant="body2" sx={{ p: 2 }}>
                Loading collections...
              </Typography>
            ) : !collections?.collections.length ? (
              <Typography variant="body2" sx={{ p: 2 }}>
                No collections available
              </Typography>
            ) : (
              collections.collections.map((collection) => (
                <div key={collection.name} className="collection-item">
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
                        <Typography variant="body2">
                          {collection.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {collection.count} items
                        </Typography>
                      </Box>
                    }
                    className="checkbox-label"
                  />
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CollectionsSelector;
