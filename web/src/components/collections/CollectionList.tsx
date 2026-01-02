import {
  Box,
  List,
  ListItem,
  Paper,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  Fab
} from "@mui/material";
import { memo, useEffect } from "react";
import CollectionForm from "./CollectionForm";
import AddIcon from "@mui/icons-material/Add";
import CollectionHeader from "./CollectionHeader";
import EmptyCollectionState from "./EmptyCollectionState";
import CollectionItem from "./CollectionItem";
import { useCollectionStore } from "../../stores/CollectionStore";
import { DialogActionButtons } from "../ui_primitives";

const CollectionList = () => {
  const {
    collections,
    isLoading,
    error,
    deleteTarget,
    showForm,
    dragOverCollection,
    indexProgress,
    indexErrors,
    setDeleteTarget,
    setShowForm,
    setIndexErrors,
    fetchCollections,
    confirmDelete,
    cancelDelete,
    handleDragOver,
    handleDragLeave,
    handleDrop
  } = useCollectionStore();

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  const handleDeleteClick = (collectionName: string) => {
    setDeleteTarget(collectionName);
  };

  const totalCount = collections?.collections.length || 0;

  return (
    <>
      {!showForm && (
        <>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mb: 2,
              mt: 1
            }}
          >
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 700 }}>
                Collections
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {totalCount} {totalCount === 1 ? "collection" : "collections"}
              </Typography>
            </Box>
            <Fab
              variant="extended"
              onClick={() => setShowForm(true)}
              aria-label="Create Collection"
              sx={{
                position: "relative",
                overflow: "hidden",
                borderRadius: 2.5,
                px: 2,
                backgroundColor: (theme) => theme.vars.palette.primary.main,
                color: "primary.contrastText",
                border: (theme) =>
                  `1px solid ${theme.vars.palette.primary.main}`,
                boxShadow: "0 2px 6px rgba(0, 0, 0, 0.25)",
                backdropFilter: "blur(2px)",
                textTransform: "none",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                "&:hover": {
                  boxShadow: (theme) =>
                    `0 4px 12px rgba(0, 0, 0, 0.35), 0 0 16px ${theme.vars.palette.primary.main}20`,
                  transform: "scale(1.03)"
                },
                "&:active": {
                  transform: "scale(0.98)"
                },
                "&::before": {
                  content: '""',
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: "55%",
                  background:
                    "linear-gradient(to bottom, rgba(255,255,255,0.18), rgba(255,255,255,0.06) 45%, rgba(255,255,255,0.02) 60%, transparent)",
                  pointerEvents: "none",
                  zIndex: 0
                },
                "&::after": {
                  content: '""',
                  position: "absolute",
                  inset: 0,
                  borderRadius: "inherit",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)",
                  pointerEvents: "none"
                },
                "& .MuiSvgIcon-root": {
                  mr: 1,
                  position: "relative",
                  zIndex: 1
                }
              }}
            >
              <AddIcon /> Create Collection
            </Fab>
          </Box>

          {collections?.collections.length ? <CollectionHeader /> : null}
          {error && (
            <Typography color="error" sx={{ mt: 2 }}>
              Error loading collections
            </Typography>
          )}
          {isLoading ? (
            <Typography sx={{ mt: 2 }}>Loading collections...</Typography>
          ) : !collections?.collections.length ? (
            <EmptyCollectionState />
          ) : (
            <Paper
              sx={{
                mt: 2,
                borderRadius: 2,
                p: 1,
                backgroundColor: "var(--palette-background-default)",
                boxShadow: (theme) =>
                  theme.palette.mode === "dark"
                    ? "0 8px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)"
                    : "0 8px 24px rgba(16,24,40,0.08), 0 0 0 1px rgba(16,24,40,0.06)"
              }}
            >
              <List>
                {collections?.collections.map((collection) => (
                  <CollectionItem
                    key={collection.name}
                    collection={collection}
                    dragOverCollection={dragOverCollection}
                    indexProgress={indexProgress}
                    onDelete={handleDeleteClick}
                    onDrop={handleDrop(collection.name)}
                    onDragOver={(e) => handleDragOver(e, collection.name)}
                    onDragLeave={handleDragLeave}
                    deleteMutation={
                      {
                        isPending: false,
                        mutate: () => {},
                        mutateAsync: async () => {},
                        reset: () => {},
                        context: undefined,
                        data: undefined,
                        error: null,
                        failureCount: 0,
                        failureReason: null,
                        isError: false,
                        isIdle: true,
                        isPaused: false,
                        isSuccess: false,
                        status: "idle",
                        submittedAt: 0,
                        variables: undefined
                      } as any
                    }
                  />
                ))}
              </List>
            </Paper>
          )}
        </>
      )}
      {showForm && <CollectionForm onClose={() => setShowForm(false)} />}

      <Dialog open={Boolean(deleteTarget)} onClose={cancelDelete}>
        <DialogTitle>Confirm Deletion</DialogTitle>
        <DialogContent>
          Are you sure you want to delete the collection &quot;{deleteTarget}
          &quot;?
        </DialogContent>
        <DialogActionButtons
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
          confirmText="Delete"
          cancelText="Cancel"
          destructive={true}
        />
      </Dialog>

      {indexErrors.length > 0 && (
        <Dialog open={true} onClose={() => setIndexErrors([])}>
          <DialogTitle>Indexing Report</DialogTitle>
          <DialogContent>
            <Typography variant="body1" sx={{ mb: 2 }}>
              The following files encountered errors during indexing:
            </Typography>
            <List sx={{ pl: 2 }}>
              {indexErrors.map((error, index) => (
                <ListItem key={index} sx={{ display: "list-item" }}>
                  <strong>{error.file}</strong>: {error.error}
                </ListItem>
              ))}
            </List>
          </DialogContent>
          <DialogActionButtons
            onConfirm={() => setIndexErrors([])}
            onCancel={() => setIndexErrors([])}
            confirmText="Close"
            cancelText=""
            cancelDisabled={true}
          />
        </Dialog>
      )}
    </>
  );
};

export default memo(CollectionList);
