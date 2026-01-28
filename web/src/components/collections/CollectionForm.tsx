/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import React from "react";
import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TextField,
  Button,
  Box,
  CircularProgress,
  Typography
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { CollectionCreate } from "../../stores/ApiTypes";
import { client } from "../../stores/ApiClient";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import EmbeddingModelSelect from "../properties/EmbeddingModelSelect";

const slideIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const styles = (theme: Theme) =>
  css({
    "&.collection-form": {
      width: "100%",
      display: "flex",
      flexDirection: "column",
      padding: theme.spacing(2, 3),
      background: theme.vars.palette.background.paper,
      position: "relative",
      animation: `${slideIn} 0.25s ease-out`,
      boxSizing: "border-box"
    },
    ".close-button": {
      position: "absolute",
      right: theme.spacing(1),
      top: theme.spacing(1),
      color: theme.vars.palette.text.secondary,
      transition: "all 0.2s",
      "&:hover": {
        color: theme.vars.palette.text.primary,
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".header-icon": {
      width: 36,
      height: 36,
      borderRadius: "10px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: `color-mix(in srgb, ${theme.vars.palette.primary.main} 15%, transparent)`,
      color: theme.vars.palette.primary.main,
      flexShrink: 0
    },
    ".field-label": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5),
      color: theme.vars.palette.text.secondary,
      fontWeight: 500,
      fontSize: "0.75rem"
    },
    ".field-icon": {
      fontSize: "0.875rem",
      opacity: 0.7
    },
    ".text-input": {
      "& .MuiOutlinedInput-root": {
        borderRadius: "10px",
        backgroundColor: theme.vars.palette.background.default,
        "& fieldset": {
          borderColor: theme.vars.palette.divider
        },
        "&:hover fieldset": {
          borderColor: theme.vars.palette.text.secondary
        },
        "&.Mui-focused fieldset": {
          borderColor: theme.vars.palette.primary.main,
          borderWidth: 1
        }
      },
      "& .MuiOutlinedInput-input": {
        padding: theme.spacing(1.25, 1.5)
      }
    },
    ".model-select": {
      "& button": {
        borderRadius: "10px !important",
        backgroundColor: `${theme.vars.palette.background.default} !important`,
        border: `1px solid ${theme.vars.palette.divider} !important`,
        "&:hover": {
          borderColor: `${theme.vars.palette.text.secondary} !important`
        }
      }
    },
    ".helper-text": {
      fontSize: "0.75rem",
      color: theme.vars.palette.text.secondary,
      lineHeight: 1.4,
      opacity: 0.8
    },
    ".submit-button": {
      borderRadius: "10px",
      padding: theme.spacing(1.25, 2.5),
      fontWeight: 600,
      textTransform: "none",
      fontSize: "0.875rem",
      "&.Mui-disabled": {
        opacity: 0.5
      }
    },
    ".error-box": {
      marginTop: theme.spacing(2),
      padding: theme.spacing(1.5),
      borderRadius: "10px",
      background: `color-mix(in srgb, ${theme.vars.palette.error.main} 10%, transparent)`,
      border: `1px solid color-mix(in srgb, ${theme.vars.palette.error.main} 25%, transparent)`
    }
  });

interface CollectionFormProps {
  onClose: () => void;
  onSuccess?: () => void;
}

const CollectionForm = ({ onClose, onSuccess }: CollectionFormProps) => {
  const theme = useTheme();
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
      if (error) {
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      setFormData({ name: "", embedding_model: "" });
      onSuccess?.();
      onClose();
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const isSubmitDisabled = useMemo(() => {
    return (
      !formData.name.trim() ||
      !formData.embedding_model.trim() ||
      createMutation.isPending
    );
  }, [formData.name, formData.embedding_model, createMutation.isPending]);

  const handleEmbeddingModelChange = (model: { type: string; id: string }) => {
    setFormData((prev) => ({
      ...prev,
      embedding_model: model.id
    }));
  };

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      css={styles(theme)}
      className="collection-form"
    >
      {/* Compact single-row layout */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>

        {/* Collection Name */}
        <Box sx={{ flex: 1, minWidth: 180 }}>
          <Typography className="field-label" sx={{ mb: 0.5 }}>Collection Name</Typography>
          <TextField
            className="text-input"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder="my-collection"
            required
            fullWidth
            size="small"
            disabled={createMutation.isPending}
            autoFocus
          />
        </Box>

        {/* Embedding Model */}
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography className="field-label" sx={{ mb: 0.5 }}>
            <AutoAwesomeIcon className="field-icon" />
            Embedding Model
          </Typography>
          <Box className="model-select">
            <EmbeddingModelSelect
              value={formData.embedding_model}
              onChange={handleEmbeddingModelChange}
            />
          </Box>
        </Box>

        {/* Submit Button */}
        <Button
          type="submit"
          variant="contained"
          disabled={isSubmitDisabled}
          className="submit-button"
          disableElevation
          sx={{ alignSelf: "flex-end", mb: 0.25 }}
          startIcon={
            createMutation.isPending ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <AddCircleOutlineIcon sx={{ fontSize: "1.125rem" }} />
            )
          }
        >
          {createMutation.isPending ? "Creating..." : "Create"}
        </Button>
      </Box>

      {/* Error Display */}
      {createMutation.isError && (
        <Box className="error-box" sx={{ mt: 2 }}>
          <Typography variant="body2" color="error">
            {createMutation.error instanceof Error
              ? createMutation.error.message
              : "Failed to create collection"}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default CollectionForm;
