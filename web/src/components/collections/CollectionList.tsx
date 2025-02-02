import {
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
  Box,
  Popover
} from "@mui/material";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { memo, useState, useCallback, useMemo } from "react";
import { CollectionList as CollectionListType } from "../../stores/ApiTypes";
import { client } from "../../stores/ApiClient";
import CollectionForm from "./CollectionForm";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import InfoIcon from "@mui/icons-material/Info";

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

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [dragOverCollection, setDragOverCollection] = useState<string | null>(
    null
  );
  const [showForm, setShowForm] = useState(false);
  const [indexProgress, setIndexProgress] = useState<{
    collection: string;
    current: number;
    total: number;
    startTime: number;
  } | null>(null);
  const [formatInfoAnchor, setFormatInfoAnchor] = useState<HTMLElement | null>(
    null
  );
  const [indexErrors, setIndexErrors] = useState<
    { file: string; error: string }[]
  >([]);

  const isElectron = useMemo(() => {
    return window.api !== undefined;
  }, []);

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
        if (!isElectron) return;
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
          total: files.length,
          startTime: Date.now()
        });

        const errors: { file: string; error: string }[] = [];
        let completed = 0;

        const chunkSize = 2;
        for (let i = 0; i < files.length; i += chunkSize) {
          const chunk = files.slice(i, i + chunkSize);
          try {
            await Promise.all(
              chunk.map(async (file) => {
                try {
                  const { data, error } = await client.POST(
                    "/api/collections/{name}/index",
                    {
                      params: {
                        path: { name: collectionName }
                      },
                      body: file
                    }
                  );
                  if (error || data?.error) {
                    errors.push({
                      file: file.path,
                      error:
                        error?.detail?.[0]?.msg ||
                        data?.error ||
                        "Unknown error"
                    });
                  }
                } catch (error: any) {
                  console.error("Failed to index file:", error);
                  errors.push({
                    file: file.path,
                    error: String(error)
                  });
                } finally {
                  completed++;
                  queryClient.invalidateQueries({ queryKey: ["collections"] });
                  setIndexProgress((prev) =>
                    prev
                      ? {
                          ...prev,
                          current: completed
                        }
                      : null
                  );
                }
              })
            );
          } catch (error) {
            console.error("Chunk processing error:", error);
          }
        }

        setIndexProgress(null);
        setIndexErrors(errors);
      },
    [isElectron, queryClient]
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent, collectionName: string) => {
      if (!isElectron) return;
      event.preventDefault();
      setDragOverCollection(collectionName);
    },
    [isElectron]
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
      {!showForm && (
        <>
          <Box sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              File Indexing with MarkItDown
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {isElectron ? (
                <>
                  <strong>Drag and drop files</strong> onto a collection to
                  index them using MarkItDown.
                </>
              ) : (
                <strong style={{ color: "#cc6666" }}>
                  File drag and drop is only available in the desktop app
                </strong>
              )}{" "}
            </Typography>
            <Typography
              variant="subtitle2"
              sx={{
                mb: 0.5,
                display: "flex",
                alignItems: "center",
                cursor: "pointer",
                "&:hover": {
                  color: "primary.main"
                }
              }}
              onClick={(e) => setFormatInfoAnchor(e.currentTarget)}
            >
              <InfoIcon sx={{ mr: 1, fontSize: "1rem" }} />
              Supported Formats
            </Typography>
            <Popover
              open={Boolean(formatInfoAnchor)}
              anchorEl={formatInfoAnchor}
              onClose={() => setFormatInfoAnchor(null)}
              anchorOrigin={{
                vertical: "bottom",
                horizontal: "left"
              }}
              transformOrigin={{
                vertical: "top",
                horizontal: "left"
              }}
            >
              <Box sx={{ p: 2, maxWidth: 400 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Supported file formats:
                </Typography>
                <List dense sx={{ mt: 1, pl: 2 }}>
                  <ListItem sx={{ display: "list-item" }}>
                    PDFs, PowerPoint, Word, Excel
                  </ListItem>
                  <ListItem sx={{ display: "list-item" }}>
                    Text files, Markdown, HTML
                  </ListItem>
                  <ListItem sx={{ display: "list-item" }}>
                    Images (text extraction with OCR)
                  </ListItem>
                </List>
              </Box>
            </Popover>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 1, fontSize: "0.8em" }}
            >
              All files will be analyzed and added to the collection for
              semantic search.
            </Typography>
          </Box>
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
                Collections enable you to:
              </Typography>
              <List sx={{ pl: 2, mb: 1 }}>
                <ListItem sx={{ display: "list-item" }}>
                  Store embeddings of text, images, and other assets
                </ListItem>
                <ListItem sx={{ display: "list-item" }}>
                  Enable semantic similarity search across content
                </ListItem>
                <ListItem sx={{ display: "list-item" }}>
                  Organize and retrieve assets based on their meaning, not just
                  keywords
                </ListItem>
              </List>
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
                      cursor: isElectron ? "copy" : "default",
                      "&:hover": {
                        backgroundColor: isElectron
                          ? "action.hover"
                          : "transparent"
                      },
                      ...(dragOverCollection === collection.name &&
                        isElectron && {
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
                          variant="body1"
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
                                  (indexProgress.current /
                                    indexProgress.total) *
                                  100
                                }
                              />
                              <br />
                              <CircularProgress
                                size={16}
                                sx={{ ml: 1, verticalAlign: "middle" }}
                              />
                              <Typography variant="caption" sx={{ ml: 1 }}>
                                Indexing {indexProgress.current}&nbsp;of&nbsp;
                                {indexProgress.total} documents
                                {indexProgress.current > 0 && (
                                  <>
                                    {" "}
                                    • ETA:{" "}
                                    {(() => {
                                      const elapsed =
                                        Date.now() - indexProgress.startTime;
                                      const avgTimePerItem =
                                        elapsed / indexProgress.current;
                                      const remainingItems =
                                        indexProgress.total -
                                        indexProgress.current;
                                      const etaSeconds = Math.round(
                                        (avgTimePerItem * remainingItems) / 1000
                                      );
                                      return etaSeconds < 60
                                        ? `${etaSeconds}s`
                                        : `${Math.round(etaSeconds / 60)}m ${
                                            etaSeconds % 60
                                          }s`;
                                    })()}
                                  </>
                                )}
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
        </>
      )}
      {showForm && <CollectionForm onClose={() => setShowForm(false)} />}

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
