import {
  List,
  ListItem,
  Paper,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button
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

  return (
    <>
      <Button
        variant="outlined"
        startIcon={<AddIcon />}
        onClick={() => setShowForm(true)}
        sx={{ mb: 2 }}
      >
        Create Collection
      </Button>
      {!showForm && (
        <>
          <CollectionHeader />
          {error && (
            <Typography color="error" sx={{ marginTop: 2 }}>
              Error loading collections
            </Typography>
          )}
          {isLoading ? (
            <Typography sx={{ marginTop: 2 }}>
              Loading collections...
            </Typography>
          ) : !collections?.collections.length ? (
            <EmptyCollectionState />
          ) : (
            <Paper sx={{ marginTop: 2 }}>
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
          <Button
            onClick={confirmDelete}
            color="error"
            variant="contained"
          >
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
