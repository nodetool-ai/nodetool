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
  LinearProgress,
  Box
} from "@mui/material";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { memo, useState, useCallback } from "react";
import { CollectionList as CollectionListType } from "../../stores/ApiTypes";
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

const CollectionList = () => {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<CollectionListType>({
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
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          File Indexing with MarkItDown
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          <strong>Drag and drop files</strong> onto a collection to index them
          using MarkItDown.
        </Typography>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          Supported Formats:
        </Typography>
        <Typography variant="body2" component="div" color="text.secondary">
          <ul style={{ margin: 0, paddingLeft: "1.5em" }}>
            <li>PDFs, PowerPoint, Word, Excel</li>
            <li>Images (with EXIF & OCR support)</li>
            <li>Audio files (with EXIF & transcription)</li>
            <li>HTML and text-based files (CSV, JSON, XML)</li>
            <li>ZIP archives (contents automatically processed)</li>
          </ul>
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          All files will be analyzed and added to the collection for semantic
          search.
        </Typography>
      </Box>
      {showForm && <CollectionForm onClose={() => setShowForm(false)} />}
      {error && (
        <Typography color="error" sx={{ marginTop: 2 }}>
          Error loading collections
        </Typography>
      )}
      {isLoading ? (
        <Typography sx={{ marginTop: 2 }}>Loading collections...</Typography>
      ) : !data?.collections.length && !showForm ? (
        <Box sx={{ marginTop: 2 }}>
          <Typography variant="h2" sx={{ margin: "1em 0 .5em 0" }}>
            ChromaDB Collections
          </Typography>
          <Typography variant="body1" sx={{ marginBottom: 1 }}>
            Collections are powerful vector databases that enable semantic
            search and retrieval of your assets.
          </Typography>
          <Typography variant="h4" sx={{ margin: "1em 0" }}>
            Create a new collection to make use of nodes in the Chroma
            namespace.
          </Typography>
          <Typography variant="body1" sx={{ marginBottom: 1 }}>
            <ul style={{ paddingLeft: "1em" }}>
              <li>Store embeddings of text, images, and other assets</li>
              <li>Enable semantic similarity search across content</li>
              <li>
                Organize and retrieve assets based on their meaning, not just
                keywords
              </li>
            </ul>
          </Typography>
        </Box>
      ) : (
        <Paper sx={{ marginTop: 2 }}>
          <List>
            {data?.collections.map((collection) => (
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
                          <CircularProgress
                            size={16}
                            sx={{ ml: 1, verticalAlign: "middle" }}
                          />
                          <Typography variant="caption" sx={{ ml: 1 }}>
                            Indexing {indexProgress.current}/
                            {indexProgress.total} documents
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

export default memo(CollectionList);
