import {
  Box,
  List,
  ListItem,
  Paper,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Divider
} from "@mui/material";
import { memo, useEffect } from "react";
import CollectionForm from "./CollectionForm";
import AddIcon from "@mui/icons-material/Add";
import CollectionHeader from "./CollectionHeader";
import EmptyCollectionState from "./EmptyCollectionState";
import CollectionItem from "./CollectionItem";
import { useCollectionStore } from "../../stores/CollectionStore";

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
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setShowForm(true)}
              sx={{ borderRadius: 2, boxShadow: 3 }}
            >
              Create Collection
            </Button>
          </Box>

          <CollectionHeader />
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
        <DialogActions>
          <Button onClick={cancelDelete}>Cancel</Button>
          <Button onClick={confirmDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
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
          <DialogActions>
            <Button onClick={() => setIndexErrors([])}>Close</Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
};

export default memo(CollectionList);
