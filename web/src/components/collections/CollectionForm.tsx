import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TextField,
  Button,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Typography
} from "@mui/material";
import { CollectionCreate, EmbeddingModel } from "../../stores/ApiTypes";
import { client } from "../../stores/ApiClient";
import CloseIcon from "@mui/icons-material/Close";
import IconButton from "@mui/material/IconButton";

const EMBEDDING_MODELS = [
  "all-MiniLM-L6-v2",
  "all-MiniLM-L12-v2",
  "all-MiniLM-L12-v3",
  "all-MiniLM-L12-v3-HFP",
  "openclip"
];

interface CollectionFormProps {
  onClose: () => void;
}

const CollectionForm = ({ onClose }: CollectionFormProps) => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<CollectionCreate>({
    name: "",
    embedding_model: "all-MiniLM-L6-v2"
  });

  const createMutation = useMutation({
    mutationFn: async (body: CollectionCreate) => {
      const { data, error } = await client.POST("/api/collections/", {
        body: body
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      setFormData({ name: "", embedding_model: "all-MiniLM-L6-v2" });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const isSubmitDisabled = useMemo(() => {
    return !formData.name.trim() || createMutation.isPending;
  }, [formData.name, createMutation.isPending]);

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{
        maxWidth: 400,
        gap: 2,
        display: "flex",
        flexDirection: "column",
        padding: 3,
        borderRadius: 1,
        backgroundColor: "background.paper",
        position: "relative"
      }}
    >
      <IconButton
        onClick={onClose}
        sx={{
          position: "absolute",
          right: 8,
          top: 8
        }}
      >
        <CloseIcon />
      </IconButton>

      <Box sx={{ mb: 2 }}>
        <Typography variant="h6">Create New Collection</Typography>
        <Typography variant="body1" color="text.secondary">
          A collection is a dedicated storage space for related documents in the
          vector database. Each collection maintains its own vector index for
          similarity search.
        </Typography>
      </Box>

      <TextField
        label="Collection Name"
        value={formData.name}
        onChange={(e) =>
          setFormData((prev) => ({ ...prev, name: e.target.value }))
        }
        required
        fullWidth
        disabled={createMutation.isPending}
        helperText="Choose a unique name for your collection"
      />

      <FormControl fullWidth>
        <InputLabel>Embedding Model</InputLabel>
        <Select
          value={formData.embedding_model}
          label="Embedding Model"
          onChange={(e) =>
            setFormData((prev) => ({
              ...prev,
              embedding_model: e.target.value as EmbeddingModel
            }))
          }
          disabled={createMutation.isPending}
        >
          {EMBEDDING_MODELS.map((model) => (
            <MenuItem key={model} value={model}>
              {model}
            </MenuItem>
          ))}
        </Select>
        <p
          style={{
            fontSize: "0.75rem",
            color: "text.secondary",
            marginTop: "0.5rem"
          }}
        >
          The embedding model converts your documents into vectors for
          similarity search. Different models offer varying trade-offs between
          speed and accuracy.
        </p>
      </FormControl>

      <Button
        type="submit"
        variant="outlined"
        disabled={isSubmitDisabled}
        startIcon={
          createMutation.isPending ? (
            <CircularProgress size={20} color="inherit" />
          ) : null
        }
      >
        {createMutation.isPending ? "Creating..." : "Create Collection"}
      </Button>
    </Box>
  );
};

export default CollectionForm;
