import React from "react";
import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TextField,
  Button,
  Box,
  FormControl,
  InputLabel,
  CircularProgress,
  Typography,
  Tooltip
} from "@mui/material";
import { CollectionCreate } from "../../stores/ApiTypes";
import { client } from "../../stores/ApiClient";
import CloseIcon from "@mui/icons-material/Close";
import IconButton from "@mui/material/IconButton";
import LlamaModelSelect from "../properties/LlamaModelSelect";
import ModelRecommendationsButton from "../node/ModelRecommendationsButton";

interface CollectionFormProps {
  onClose: () => void;
}

const embeddingModels = [
  {
    id: "all-minilm:22m",
    name: "All-MiniLM 22M (recommended)"
  },
  {
    id: "all-minilm:33m",
    name: "All-MiniLM 33M"
  },
  {
    id: "nomic-embed-text:latest",
    name: "Nomic Embed Text"
  },
  {
    id: "mxbai-embed-large:335m",
    name: "MXBai Embed Large"
  },
  {
    id: "snowflake-arctic-embed:22m",
    name: "Snowflake Arctic Embed 22M"
  },
  {
    id: "snowflake-arctic-embed:33m",
    name: "Snowflake Arctic Embed 33M"
  },
  {
    id: "snowflake-arctic-embed:110m",
    name: "Snowflake Arctic Embed 110M"
  },
  {
    id: "snowflake-arctic-embed:137m",
    name: "Snowflake Arctic Embed 137M"
  },
  {
    id: "snowflake-arctic-embed:335m",
    name: "Snowflake Arctic Embed 335M"
  },
  {
    id: "bge-large:335m",
    name: "BGE Large 335M"
  },
  {
    id: "bge-m3:567m",
    name: "BGE M3 567M"
  },
  {
    id: "snowflake-arctic-embed2:568m",
    name: "Snowflake Arctic Embed 2 568M"
  },
  {
    id: "granite-embedding:30m  ",
    name: "Granite Embedding 30M"
  },
  {
    id: "granite-embedding:278m",
    name: "Granite Embedding 278M"
  }
].map((model) => ({
  id: model.id,
  name: model.name,
  type: "llama_model",
  repo_id: model.id
}));

const CollectionForm = ({ onClose }: CollectionFormProps) => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<CollectionCreate>({
    name: "",
    embedding_model: ""
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
      setFormData({
        name: "",
        embedding_model: ""
      });
      onClose();
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const isSubmitDisabled = useMemo(() => {
    return !formData.name.trim() || createMutation.isPending;
  }, [formData.name, createMutation.isPending]);

  const handleEmbeddingModelChange = (model: {
    type: string;
    repo_id: string;
  }) => {
    setFormData((prev) => ({
      ...prev,
      embedding_model: model.repo_id
    }));
  };

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
      <Tooltip title="Close New Collection form">
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
      </Tooltip>

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
        helperText="Set a unique name for the new collection"
      />

      <ModelRecommendationsButton recommendedModels={embeddingModels} />

      <FormControl fullWidth>
        <InputLabel
          sx={{
            position: "relative",
            transform: "none",
            marginBottom: "0.5rem"
          }}
        >
          Embedding Model
        </InputLabel>
        <LlamaModelSelect
          value={formData.embedding_model}
          onChange={handleEmbeddingModelChange}
        />
        <p
          style={{
            fontSize: "0.75rem",
            color: "text.secondary",
            marginTop: "0.5rem"
          }}
        >
          Click on RECOMMENDED MODELS to find an embedding models and select it.
          <br />
          <br />
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
