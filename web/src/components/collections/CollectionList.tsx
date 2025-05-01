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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { memo, useState, useCallback, useMemo } from "react";
import { CollectionList as CollectionListType } from "../../stores/ApiTypes";
import { client } from "../../stores/ApiClient";
import CollectionForm from "./CollectionForm";
import AddIcon from "@mui/icons-material/Add";
import CollectionHeader from "./CollectionHeader";
import EmptyCollectionState from "./EmptyCollectionState";
import CollectionItem from "./CollectionItem";
import { useCollectionDragAndDrop } from "../../hooks/useCollectionDragAndDrop";

const CollectionList = () => {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<CollectionListType>({
    queryKey: ["collections"],
    queryFn: async () => {
      const { data, error } = await client.GET("/api/collections/");
      if (error) {
        throw new Error(error.detail?.[0]?.msg || "Unknown error");
      }
      return data;
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (collectionName: string) => {
      const { error } = await client.DELETE("/api/collections/{name}", {
        params: { path: { name: collectionName } }
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    }
  });

  const isElectron = useMemo(() => {
    return window.api !== undefined;
  }, []);

  const {
    dragOverCollection,
    indexProgress,
    indexErrors,
    setIndexErrors,
    handleDrop,
    handleDragOver,
    handleDragLeave
  } = useCollectionDragAndDrop();

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const handleDeleteClick = (collectionName: string) => {
    setDeleteTarget(collectionName);
  };

  const handleConfirmDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate(deleteTarget);
      setDeleteTarget(null);
    }
  };

  const handleCancelDelete = () => {
    setDeleteTarget(null);
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
          ) : !data?.collections.length ? (
            <EmptyCollectionState />
          ) : (
            <Paper sx={{ marginTop: 2 }}>
              <List>
                {data?.collections.map((collection) => (
                  <CollectionItem
                    key={collection.name}
                    collection={collection}
                    isElectron={isElectron}
                    dragOverCollection={dragOverCollection}
                    indexProgress={indexProgress}
                    onDelete={handleDeleteClick}
                    onDrop={(e) => handleDrop(collection.name)(e)}
                    onDragOver={(e) => handleDragOver(e, collection.name)}
                    onDragLeave={handleDragLeave}
                    deleteMutation={deleteMutation}
                  />
                ))}
              </List>
            </Paper>
          )}
        </>
      )}
      {showForm && <CollectionForm onClose={() => setShowForm(false)} />}

      <Dialog open={Boolean(deleteTarget)} onClose={handleCancelDelete}>
        <DialogTitle>Confirm Deletion</DialogTitle>
        <DialogContent>
          Are you sure you want to delete the collection &quot;{deleteTarget}
          &quot;?
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDelete}>Cancel</Button>
          <Button
            onClick={handleConfirmDelete}
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
