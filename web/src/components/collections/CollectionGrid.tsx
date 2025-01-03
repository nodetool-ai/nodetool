import {
  Grid2,
  List,
  ListItem,
  ListItemText,
  Paper,
  Typography,
  IconButton,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  LinearProgress
} from "@mui/material";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { memo, useState, useCallback } from "react";
import { CollectionList, IndexRequest } from "../../stores/ApiTypes";
import { client } from "../../stores/ApiClient";
import CollectionForm from "./CollectionForm";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";

type IndexMutation = {
  name: string;
  file: {
    path: string;
    mime_type: string;
  };
};

const CollectionGrid = () => {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<CollectionList>({
    queryKey: ["collections"],
    queryFn: async () => {
      const { data, error } = await client.GET("/api/collections/");
      if (error) {
        throw error;
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
  const indexMutation = useMutation({
    mutationFn: async (req: IndexMutation) => {
      const { error } = await client.POST("/api/collections/{name}/index", {
        params: {
          path: { name: req.name }
        },
        body: {
          files: [req.file]
        }
      });
      if (error) throw error;
      return "success";
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    }
  });

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [dragOverCollection, setDragOverCollection] = useState<string | null>(
    null
  );
  const [showForm, setShowForm] = useState(false);
  const [indexProgress, setIndexProgress] = useState<{
    collection: string;
    current: number;
    total: number;
  } | null>(null);

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

  const handleDrop = useCallback(
    (collectionName: string) =>
      async (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDragOverCollection(null);
        const files = Array.from(event.dataTransfer.files).map((file) => ({
          // @ts-ignore
          path: file.path,
          mime_type: file.type
        }));

        setIndexProgress({
          collection: collectionName,
          current: 0,
          total: files.length
        });

        try {
          for (let i = 0; i < files.length; i++) {
            await indexMutation.mutateAsync({
              name: collectionName,
              file: files[i]
            });
            setIndexProgress((prev) =>
              prev
                ? {
                    ...prev,
                    current: i + 1
                  }
                : null
            );
          }
        } catch (error) {
          console.error("Failed to index file:", error);
        } finally {
          setIndexProgress(null);
        }
      },
    [indexMutation]
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent, collectionName: string) => {
      event.preventDefault();
      setDragOverCollection(collectionName);
    },
    []
  );

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setDragOverCollection(null);
  }, []);

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
      {showForm && <CollectionForm onClose={() => setShowForm(false)} />}
      {error && (
        <Typography color="error" sx={{ marginTop: 2 }}>
          Error loading collections
        </Typography>
      )}
      {isLoading ? (
        <Typography sx={{ marginTop: 2 }}>Loading collections...</Typography>
      ) : !data?.collections.length ? (
        <Typography sx={{ marginTop: 2 }}>No collections found</Typography>
      ) : (
        <Paper sx={{ marginTop: 2 }}>
          <List>
            {data.collections.map((collection) => (
              <ListItem
                component="div"
                key={collection.name}
                onDrop={(e: React.DragEvent<HTMLDivElement>) =>
                  handleDrop(collection.name)(e)
                }
                onDragOver={(e) => handleDragOver(e, collection.name)}
                onDragLeave={handleDragLeave}
                sx={{
                  borderBottom: "1px solid #666",
                  cursor: "copy",
                  "&:hover": {
                    backgroundColor: "action.hover"
                  },
                  ...(dragOverCollection === collection.name && {
                    backgroundColor: "action.selected",
                    borderStyle: "dashed",
                    borderWidth: 2,
                    borderColor: "primary.main",
                    "& .MuiTypography-root": {
                      color: "primary.main"
                    }
                  }),
                  transition: "all 0.2s"
                }}
                secondaryAction={
                  <IconButton
                    edge="end"
                    aria-label="delete"
                    onClick={() => handleDeleteClick(collection.name)}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending &&
                    deleteMutation.variables === collection.name ? (
                      <CircularProgress size={20} />
                    ) : (
                      <DeleteIcon />
                    )}
                  </IconButton>
                }
              >
                <ListItemText
                  primary={
                    <Typography
                      variant="h4"
                      sx={{
                        fontWeight: 600,
                        color: "primary.main"
                      }}
                    >
                      {collection.name}
                      {indexProgress?.collection === collection.name && (
                        <>
                          <LinearProgress
                            sx={{
                              ml: 2,
                              width: 100,
                              display: "inline-block",
                              verticalAlign: "middle"
                            }}
                            variant="determinate"
                            value={
                              (indexProgress.current / indexProgress.total) *
                              100
                            }
                          />
                          <Typography variant="caption" sx={{ ml: 1 }}>
                            {indexProgress.current}/{indexProgress.total}
                          </Typography>
                        </>
                      )}
                    </Typography>
                  }
                  secondary={
                    <Typography
                      variant="body1"
                      sx={{
                        color: "text.secondary",
                        fontSize: "0.8em"
                      }}
                    >
                      {collection.metadata?.embedding_model}
                      <br />
                      {collection.count} items
                    </Typography>
                  }
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

      <Dialog open={Boolean(deleteTarget)} onClose={handleCancelDelete}>
        <DialogTitle>Confirm Deletion</DialogTitle>
        <DialogContent>
          Are you sure you want to delete the collection "{deleteTarget}"?
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
    </>
  );
};

export default memo(CollectionGrid);
