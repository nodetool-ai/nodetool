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
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
          label={t("screen_assets.collections.name")}
          sx={{ flex: 1, minWidth: 180 }}
          value={formData.name}
          onChange={(e) =>
            setFormData((prev: { name: string; embedding_model: string }) => ({
              ...prev,
              name: e.target.value
            }))
          }
          placeholder={t("i18n-next5.collections.namePlaceholder")}
          required
          fullWidth
          size="small"
          disabled={createMutation.isPending}
          autoFocus
        />

        <FormField
          label={t("screen_assets.collections.embeddingModel")}
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
          loading={createMutation.isPending}
          startIcon={<AddCircleOutlineIcon />}
        >
          {createMutation.isPending ? t("screen_assets.collections.creating") : t("screen_assets.collections.create")}
        </EditorButton>
      </FlexRow>

      {createMutation.isError && (
        <AlertBanner severity="error" sx={{ mt: SPACING.lg }}>
          {createMutation.error instanceof Error
            ? createMutation.error.message
            : t("screen_assets.collections.createFailed")}
        </AlertBanner>
      )}
    </FlexColumn>
  );
};

export default CollectionForm;
