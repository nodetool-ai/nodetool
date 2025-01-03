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
  Button
} from "@mui/material";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { memo, useState } from "react";
import { CollectionList } from "../../stores/ApiTypes";
import { client } from "../../stores/ApiClient";
import CollectionForm from "./CollectionForm";
import DeleteIcon from "@mui/icons-material/Delete";

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

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

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

  if (error) {
    return (
      <>
        <CollectionForm />
        <Typography color="error" sx={{ marginTop: 2 }}>
          Error loading collections
        </Typography>
      </>
    );
  }

  return (
    <>
      <CollectionForm />
      {isLoading ? (
        <Typography sx={{ marginTop: 2 }}>Loading collections...</Typography>
      ) : !data?.collections.length ? (
        <Typography sx={{ marginTop: 2 }}>No collections found</Typography>
      ) : (
        <Paper sx={{ marginTop: 2 }}>
          <List>
            {data.collections.map((collection) => (
              <ListItem
                key={collection.name}
                sx={{
                  borderBottom: "1px solid #666"
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
                      variant="h6"
                      sx={{
                        fontWeight: 600,
                        color: "primary.main"
                      }}
                    >
                      {collection.name}
                    </Typography>
                  }
                  secondary={
                    <Typography
                      variant="body1"
                      sx={{
                        color: "text.secondary",
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5
                      }}
                    >
                      {collection.metadata?.embedding_model}
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
