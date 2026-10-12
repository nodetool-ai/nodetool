/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import React from "react";
import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertBanner,
  FormField,
  FlexRow,
  FlexColumn,
  LoadingSpinner,
  TextInput,
  EditorButton,
  MOTION,
  SPACING
} from "../ui_primitives";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { CollectionCreate } from "../../stores/ApiTypes";
import { trpcClient } from "../../trpc/client";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
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
      padding: theme.spacing(2, 3),
      background: theme.vars.palette.background.paper,
      position: "relative",
      animation: `${slideIn} ${MOTION.normal}`,
      boxSizing: "border-box"
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
      const input: Parameters<typeof trpcClient.collections.create.mutate>[0] =
        { name: body.name, embedding_model: body.embedding_model };
      if (body.embedding_provider) {
        input.embedding_provider = body.embedding_provider;
      }
      return trpcClient.collections.create.mutate(input);
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

  const handleEmbeddingModelChange = (model: {
    type: string;
    id: string;
    provider: string;
  }) => {
    setFormData((prev) => ({
      ...prev,
      embedding_model: model.id,
      embedding_provider: model.provider
    }));
  };

  return (
    <FlexColumn
      component="form"
      onSubmit={handleSubmit}
      css={styles(theme)}
      className="collection-form"
    >
      <FlexRow gap={SPACING.lg} align="center" wrap>
        <TextInput
          label="Collection name"
          sx={{ flex: 1, minWidth: 180 }}
          value={formData.name}
          onChange={(e) =>
            setFormData((prev: { name: string; embedding_model: string }) => ({
              ...prev,
              name: e.target.value
            }))
          }
          placeholder="my-collection"
          required
          fullWidth
          size="small"
          disabled={createMutation.isPending}
          autoFocus
        />

        <FormField
          label="Embedding model"
          compact
          sx={{ flex: 1, minWidth: 200 }}
        >
          <EmbeddingModelSelect
            value={formData.embedding_model}
            provider={formData.embedding_provider ?? undefined}
            onChange={handleEmbeddingModelChange}
          />
        </FormField>

        <EditorButton
          type="submit"
          variant="contained"
          disabled={isSubmitDisabled}
          disableElevation
          sx={{ alignSelf: "flex-end", mb: 0.5 }}
          startIcon={
            createMutation.isPending ? (
              <LoadingSpinner size="small" color="inherit" />
            ) : (
              <AddCircleOutlineIcon sx={{ fontSize: "var(--fontSizeBig)" }} />
            )
          }
        >
          {createMutation.isPending ? "Creating..." : "Create"}
        </EditorButton>
      </FlexRow>

      {createMutation.isError && (
        <AlertBanner severity="error" sx={{ mt: SPACING.lg }}>
          {createMutation.error instanceof Error
            ? createMutation.error.message
            : "Failed to create collection"}
        </AlertBanner>
      )}
    </FlexColumn>
  );
};

export default CollectionForm;
