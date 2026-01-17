/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  Typography,
  Box,
  Fab,
  List,
  IconButton,
  Dialog as MuiDialog,
  DialogTitle as MuiDialogTitle,
  DialogContent as MuiDialogContent,
  DialogActions as MuiDialogActions,
  Button,
  ListItem,
  LinearProgress,
  Tooltip,
  Chip,
  Skeleton
} from "@mui/material";
import React, { useEffect, memo, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import StorageIcon from "@mui/icons-material/Storage";
import LayersIcon from "@mui/icons-material/Layers";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import DataObjectIcon from "@mui/icons-material/DataObject";
import EditIcon from "@mui/icons-material/Edit";
import CollectionForm from "./CollectionForm";
import { useCollectionStore } from "../../stores/CollectionStore";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "../../stores/ApiClient";



const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const pulse = keyframes`
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
`;

const styles = (theme: Theme) =>
  css({
    ".collections-manager-dialog": {
      display: "flex",
      height: "100%",
      overflow: "hidden"
    },
    ".dialog-title": {
      position: "sticky",
      top: 0,
      zIndex: 2,
      background: theme.vars.palette.background.paper,
      margin: 0,
      padding: theme.spacing(3, 4),
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backdropFilter: "blur(20px) saturate(180%)"
    },
    ".close-button": {
      position: "absolute",
      right: theme.spacing(2),
      top: theme.spacing(2),
      color: theme.vars.palette.text.secondary,
      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      "&:hover": {
        color: theme.vars.palette.text.primary,
        backgroundColor: theme.vars.palette.action.hover,
        transform: "rotate(90deg)"
      }
    },
    ".collections-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing(2),
      marginBottom: theme.spacing(3)
    },
    ".header-content": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1),
      flex: 1
    },
    ".create-button": {
      position: "relative",
      overflow: "hidden",
      borderRadius: "12px",
      padding: theme.spacing(1.5, 3),
      background: theme.vars.palette.primary.main,
      color: theme.vars.palette.primary.contrastText,
      border: "none",
      boxShadow: `0 4px 14px color-mix(in srgb, ${theme.vars.palette.primary.main} 40%, transparent)`,
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      "&:hover": {
        boxShadow: `0 6px 20px color-mix(in srgb, ${theme.vars.palette.primary.main} 50%, transparent)`,
        transform: "translateY(-2px)"
      },
      "&:active": {
        transform: "translateY(0) scale(0.98)"
      }
    },
    ".collections-container": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(2)
    },
    ".collection-card": {
      position: "relative",
      width: "100%",
      background: theme.vars.palette.background.paper,
      borderRadius: "16px",
      border: `1px solid ${theme.vars.palette.divider}`,
      padding: theme.spacing(2.5, 3),
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      backdropFilter: "blur(10px)",
      animation: `${fadeIn} 0.4s ease-out`,
      boxShadow: `0 2px 8px color-mix(in srgb, ${theme.vars.palette.common.black} 10%, transparent)`,
      "&:hover": {
        background: theme.vars.palette.background.default,
        borderColor: theme.vars.palette.primary.main,
        boxShadow: `0 8px 32px color-mix(in srgb, ${theme.vars.palette.common.black} 15%, transparent), 0 0 0 1px color-mix(in srgb, ${theme.vars.palette.primary.main} 20%, transparent)`,
        transform: "translateY(-2px)",
        "& .delete-button": {
          opacity: 1
        }
      }
    },
    ".collection-icon": {
      width: 36,
      height: 36,
      borderRadius: "10px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: `color-mix(in srgb, ${theme.vars.palette.primary.main} 15%, transparent)`,
      color: theme.vars.palette.primary.main
    },
    ".meta-chip": {
      fontSize: "0.75rem",
      height: "26px",
      borderRadius: "8px",
      background: theme.vars.palette.action.hover,
      border: `1px solid ${theme.vars.palette.divider}`,
      "& .MuiChip-icon": {
        color: theme.vars.palette.text.secondary,
        fontSize: "0.875rem"
      }
    },
    ".workflow-chip": {
      cursor: "pointer",
      transition: "all 0.2s",
      "&:hover": {
        background: `color-mix(in srgb, ${theme.vars.palette.primary.main} 10%, transparent)`,
        borderColor: theme.vars.palette.primary.light
      }
    },
    ".no-workflow-chip": {
      opacity: 0.6,
      fontStyle: "italic"
    },
    ".delete-button": {
      opacity: 0,
      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      color: theme.vars.palette.text.secondary,
      "&:hover": {
        color: theme.vars.palette.error.main,
        background: `color-mix(in srgb, ${theme.vars.palette.error.main} 10%, transparent)`
      }
    },
    ".info-banner": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1.5),
      padding: theme.spacing(1.5, 2),
      borderRadius: "12px",
      background: `color-mix(in srgb, ${theme.vars.palette.info.main} 8%, transparent)`,
      border: `1px solid color-mix(in srgb, ${theme.vars.palette.info.main} 15%, transparent)`,
      marginBottom: theme.spacing(2),
      cursor: "pointer",
      transition: "all 0.2s",
      "&:hover": {
        background: `color-mix(in srgb, ${theme.vars.palette.info.main} 12%, transparent)`,
        borderColor: theme.vars.palette.info.light
      }
    },
    ".progress-container": {
      marginBottom: theme.spacing(3),
      padding: theme.spacing(2),
      borderRadius: "12px",
      background: `color-mix(in srgb, ${theme.vars.palette.primary.main} 8%, transparent)`,
      border: `1px solid color-mix(in srgb, ${theme.vars.palette.primary.main} 15%, transparent)`
    },
    ".progress-bar": {
      height: 8,
      borderRadius: 4,
      backgroundColor: `color-mix(in srgb, ${theme.vars.palette.primary.main} 20%, transparent)`,
      "& .MuiLinearProgress-bar": {
        borderRadius: 4,
        background: theme.vars.palette.primary.main
      }
    },
    ".skeleton-card": {
      borderRadius: "16px",
      animation: `${pulse} 1.5s ease-in-out infinite`
    },
    ".empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      padding: theme.spacing(6, 3),
      minHeight: "300px"
    },
    ".empty-icon-container": {
      width: 80,
      height: 80,
      borderRadius: "20px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: `color-mix(in srgb, ${theme.vars.palette.primary.main} 15%, transparent)`,
      marginBottom: theme.spacing(3),
      position: "relative",
      "&::after": {
        content: '""',
        position: "absolute",
        inset: -2,
        borderRadius: "22px",
        background: `linear-gradient(135deg, color-mix(in srgb, ${theme.vars.palette.primary.main} 30%, transparent), transparent)`,
        zIndex: -1
      }
    },
    ".title-badge": {
      display: "inline-flex",
      alignItems: "center",
      gap: theme.spacing(0.75),
      padding: theme.spacing(0.5, 1.5),
      borderRadius: "20px",
      background: `color-mix(in srgb, ${theme.vars.palette.primary.main} 10%, transparent)`,
      color: theme.vars.palette.primary.main,
      fontSize: "0.75rem",
      fontWeight: 600,
      marginLeft: theme.spacing(1.5)
    }
  });

interface CollectionsManagerProps {
  open: boolean;
  onClose: () => void;
}

const CollectionCard = memo(
  ({
    collection,
    onDelete,
    animationDelay,
    onUpdateDisplayName
  }: {
    collection: { name: string; count: number; metadata?: Record<string, unknown>; workflow_name?: string | null };
    onDelete: (name: string) => void;
    animationDelay: number;
    onUpdateDisplayName: (collectionName: string, displayName: string) => void;
  }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState("");
    const inputRef = React.useRef<HTMLInputElement>(null);

    const displayName = (collection.metadata?.display_name as string) || collection.name;

    const handleStartEdit = () => {
      setEditValue(displayName);
      setIsEditing(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    };

    const handleSave = () => {
      const trimmed = editValue.trim();
      if (trimmed && trimmed !== displayName) {
        onUpdateDisplayName(collection.name, trimmed);
      }
      setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSave();
      } else if (e.key === "Escape") {
        setIsEditing(false);
      }
    };

    return (
      <Box
        className="collection-card"
        sx={{
          animationDelay: `${animationDelay * 0.05}s`,
          display: "flex",
          alignItems: "center",
          gap: 2
        }}
      >
        {/* Left: Icon + Name */}
        <Box className="collection-icon" sx={{ flexShrink: 0 }}>
          <StorageIcon sx={{ fontSize: "1.25rem" }} />
        </Box>

        <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 0.25 }}>
          {isEditing ? (
            <input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              style={{
                fontSize: "1rem",
                fontWeight: 600,
                padding: "2px 6px",
                border: "1px solid var(--palette-primary-main)",
                borderRadius: "6px",
                background: "var(--palette-background-default)",
                color: "inherit",
                outline: "none",
                width: "100%",
                maxWidth: 200,
                boxSizing: "border-box"
              }}
            />
          ) : (
            <Tooltip title="Double-click to edit name">
              <Typography
                variant="h6"
                onDoubleClick={handleStartEdit}
                sx={{
                  fontWeight: 600,
                  fontSize: "0.9375rem",
                  color: "text.primary",
                  lineHeight: 1.3,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.5,
                  "&:hover": {
                    "& .edit-indicator": {
                      opacity: 1
                    }
                  }
                }}
              >
                {displayName}
                <EditIcon
                  className="edit-indicator"
                  sx={{
                    fontSize: "0.8rem",
                    opacity: 0,
                    transition: "opacity 0.2s",
                    color: "text.secondary"
                  }}
                />
              </Typography>
            </Tooltip>
          )}
          {displayName !== collection.name && (
            <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.7rem" }}>
              {collection.name}
            </Typography>
          )}
        </Box>

        {/* Center: Document count */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "text.secondary", minWidth: 100 }}>
          <DataObjectIcon sx={{ fontSize: "0.9rem" }} />
          <Typography variant="body2" sx={{ fontWeight: 500, whiteSpace: "nowrap" }}>
            {collection.count} {collection.count === 1 ? "doc" : "docs"}
          </Typography>
        </Box>

        {/* Right: Metadata chips */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
          {collection.metadata?.embedding_model ? (
            <Tooltip title="Embedding model">
              <Chip
                className="meta-chip"
                icon={<AutoAwesomeIcon />}
                label={String(collection.metadata.embedding_model)}
                size="small"
              />
            </Tooltip>
          ) : null}
          <Tooltip title={collection.workflow_name ? "Ingestion workflow" : "No workflow configured"}>
            <Chip
              className={`meta-chip workflow-chip ${!collection.workflow_name ? "no-workflow-chip" : ""}`}
              icon={<AccountTreeIcon />}
              label={collection.workflow_name || "No workflow"}
              size="small"
            />
          </Tooltip>
        </Box>

        {/* Delete button */}
        <Tooltip title="Delete collection">
          <IconButton
            className="delete-button"
            size="small"
            onClick={() => onDelete(collection.name)}
            sx={{ flexShrink: 0 }}
          >
            <DeleteOutlineIcon sx={{ fontSize: "1.125rem" }} />
          </IconButton>
        </Tooltip>
      </Box>
    );
  }
);

CollectionCard.displayName = "CollectionCard";

const LoadingSkeleton = () => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
    {[1, 2, 3].map((i) => (
      <Skeleton
        key={i}
        className="skeleton-card"
        variant="rounded"
        height={100}
        sx={{ borderRadius: "16px" }}
      />
    ))}
  </Box>
);

const EmptyState = memo(({ onCreateClick }: { onCreateClick: () => void }) => {

  return (
    <Box className="empty-state">
      <Box className="empty-icon-container">
        <LayersIcon sx={{ fontSize: "2.5rem", color: "primary.main" }} />
      </Box>
      <Typography
        variant="h5"
        sx={{
          fontWeight: 600,
          mb: 1,
          color: "text.primary"
        }}
      >
        No Collections Yet
      </Typography>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mb: 3, maxWidth: 360 }}
      >
        Collections store your documents as vector embeddings, enabling powerful semantic search in your workflows.
      </Typography>
      <Button
        variant="contained"
        startIcon={<AddIcon />}
        onClick={onCreateClick}
        sx={{
          borderRadius: "12px",
          px: 3,
          py: 1.25,
          textTransform: "none",
          fontWeight: 600,
          "&:hover": {
            transform: "translateY(-2px)"
          }
        }}
      >
        Create Your First Collection
      </Button>
    </Box>
  );
});

EmptyState.displayName = "EmptyState";

const CollectionsManager: React.FC<CollectionsManagerProps> = ({ open, onClose }) => {
  const theme = useTheme();
  const queryClient = useQueryClient();

  const {
    collections,
    isLoading,
    error,
    deleteTarget,
    showForm,
    indexProgress,
    indexErrors,
    setDeleteTarget,
    setShowForm,
    setIndexErrors,
    fetchCollections,
    confirmDelete,
    cancelDelete
  } = useCollectionStore();

  const updateDisplayNameMutation = useMutation({
    mutationFn: async ({ collectionName, displayName }: { collectionName: string; displayName: string }) => {
      const { data, error } = await client.PUT("/api/collections/{name}", {
        params: { path: { name: collectionName } },
        body: { metadata: { display_name: displayName } }
      });
      if (error) {
        throw new Error("Failed to update display name");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      fetchCollections();
    }
  });

  const handleUpdateDisplayName = (collectionName: string, displayName: string) => {
    updateDisplayNameMutation.mutate({ collectionName, displayName });
  };

  useEffect(() => {
    if (open) {
      fetchCollections();
    }
  }, [open, fetchCollections]);

  const totalCount = collections?.collections.length || 0;

  return (
    <Dialog
      css={styles(theme)}
      className="collections-manager-dialog"
      open={open}
      onClose={onClose}
      slotProps={{
        backdrop: {
          style: {
            backdropFilter: theme.vars.palette.glass?.blur ?? "blur(12px) saturate(150%)",
            backgroundColor: theme.vars.palette.glass?.backgroundDialog ?? "rgba(0,0,0,0.5)"
          }
        },
        paper: {
          style: {
            borderRadius: "24px",
            background: theme.vars.palette.background.paper,
            backdropFilter: "blur(40px) saturate(180%)",
            border: `1px solid ${theme.vars.palette.divider}`
          }
        }
      }}
      sx={{
        "& .MuiDialog-paper": {
          width: "92%",
          maxWidth: "900px",
          height: "85vh",
          maxHeight: "85vh",
          margin: "auto"
        }
      }}
    >
      <DialogTitle className="dialog-title">
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <StorageIcon
            sx={{
              fontSize: "1.75rem",
              color: "primary.main",
              mr: 1.5
            }}
          />
          <Typography
            variant="h5"
            sx={{
              fontWeight: 700,
              letterSpacing: "-0.02em"
            }}
          >
            Collections
          </Typography>
          {totalCount > 0 && (
            <Box className="title-badge">
              {totalCount} {totalCount === 1 ? "collection" : "collections"}
            </Box>
          )}
        </Box>
        <Tooltip title="Close">
          <IconButton
            aria-label="close"
            onClick={onClose}
            className="close-button"
          >
            <CloseIcon />
          </IconButton>
        </Tooltip>
      </DialogTitle>
      <DialogContent
        sx={{
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          padding: 0
        }}
      >
        <Box sx={{ p: 3, height: "100%", overflow: "auto" }}>
          <Box className="collections-header">
            <Box className="header-content">
              <Typography
                variant="body2"
                sx={{
                  color: "text.secondary",
                  lineHeight: 1.6
                }}
              >
                Store documents as vector embeddings for semantic search and retrieval in your workflows.
              </Typography>
            </Box>
            <Fab
              variant="extended"
              onClick={() => setShowForm(!showForm)}
              aria-label={showForm ? "Cancel" : "Create Collection"}
              className={showForm ? "cancel-button" : "create-button"}
              sx={showForm ? {
                background: theme.vars.palette.action.hover,
                color: theme.vars.palette.text.primary,
                boxShadow: "none",
                "&:hover": {
                  background: theme.vars.palette.action.selected
                }
              } : undefined}
            >
              <AddIcon sx={{ mr: 1, transform: showForm ? "rotate(45deg)" : "none", transition: "transform 0.2s" }} />
              {showForm ? "Cancel" : "New Collection"}
            </Fab>
          </Box>

          {/* Inline Form - shown below the header when toggled */}
          {showForm && (
            <Box sx={{ mb: 2 }}>
              <CollectionForm onClose={() => setShowForm(false)} onSuccess={fetchCollections} />
            </Box>
          )}

          {indexProgress && (
            <Box className="progress-container">
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 500, color: "primary.main" }}>
                  Indexing documents...
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {indexProgress.current} / {indexProgress.total}
                </Typography>
              </Box>
              <LinearProgress
                className="progress-bar"
                variant="determinate"
                value={(indexProgress.current / indexProgress.total) * 100}
              />
            </Box>
          )}

          {error && (
            <Box
              sx={{
                p: 2,
                mb: 2,
                borderRadius: "12px",
                background: `color-mix(in srgb, ${theme.vars.palette.error.main} 10%, transparent)`,
                border: `1px solid color-mix(in srgb, ${theme.vars.palette.error.main} 20%, transparent)`
              }}
            >
              <Typography color="error" variant="body2">
                {error}
              </Typography>
            </Box>
          )}

          {isLoading ? (
            <LoadingSkeleton />
          ) : !collections?.collections.length && !showForm ? (
            <EmptyState onCreateClick={() => setShowForm(true)} />
          ) : (
            <Box className="collections-container">
              {collections?.collections.map((collection, index) => (
                <CollectionCard
                  key={collection.name}
                  collection={collection}
                  onDelete={(name) => setDeleteTarget(name)}
                  onUpdateDisplayName={handleUpdateDisplayName}
                  animationDelay={index}
                />
              ))}
            </Box>
          )}
        </Box>
      </DialogContent>

      <MuiDialog
        open={Boolean(deleteTarget)}
        onClose={cancelDelete}
        PaperProps={{
          sx: {
            borderRadius: "16px",
            p: 1
          }
        }}
      >
        <MuiDialogTitle sx={{ fontWeight: 600 }}>Delete Collection</MuiDialogTitle>
        <MuiDialogContent>
          <Typography variant="body2" color="text.secondary">
            Are you sure you want to delete <strong>&quot;{deleteTarget}&quot;</strong>? This action cannot be undone.
          </Typography>
        </MuiDialogContent>
        <MuiDialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={cancelDelete}
            sx={{ borderRadius: "10px", textTransform: "none" }}
          >
            Cancel
          </Button>
          <Button
            onClick={confirmDelete}
            color="error"
            variant="contained"
            sx={{
              borderRadius: "10px",
              textTransform: "none",
              boxShadow: "none",
              "&:hover": {
                boxShadow: `0 4px 12px color-mix(in srgb, ${theme.vars.palette.error.main} 40%, transparent)`
              }
            }}
          >
            Delete
          </Button>
        </MuiDialogActions>
      </MuiDialog>

      {indexErrors.length > 0 && (
        <MuiDialog
          open={true}
          onClose={() => setIndexErrors([])}
          PaperProps={{
            sx: {
              borderRadius: "16px",
              p: 1,
              maxWidth: 500
            }
          }}
        >
          <MuiDialogTitle sx={{ fontWeight: 600 }}>Indexing Report</MuiDialogTitle>
          <MuiDialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              The following files encountered errors during indexing:
            </Typography>
            <List sx={{ pl: 2 }}>
              {indexErrors.map((err, index) => (
                <ListItem key={index} sx={{ display: "list-item", py: 0.5 }}>
                  <Typography variant="body2">
                    <strong>{err.file}</strong>: {err.error}
                  </Typography>
                </ListItem>
              ))}
            </List>
          </MuiDialogContent>
          <MuiDialogActions sx={{ px: 3, pb: 2 }}>
            <Button
              onClick={() => setIndexErrors([])}
              sx={{ borderRadius: "10px", textTransform: "none" }}
            >
              Close
            </Button>
          </MuiDialogActions>
        </MuiDialog>
      )}
    </Dialog>
  );
};

export default memo(CollectionsManager);
