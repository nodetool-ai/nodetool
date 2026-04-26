/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useState, useCallback } from "react";
import {
  TextField,
  Card,
  CardContent,
  Grid,
  Box
} from "@mui/material";
import { Text, Caption, EditorButton } from "../ui_primitives";
import { useQuery } from "@tanstack/react-query";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";

interface HuggingFaceSearchResult {
  id: string;
  modelId: string;
  pipeline_tag?: string;
  description?: string;
  downloads: number;
}

const searchModels = async (query: string): Promise<HuggingFaceSearchResult[]> => {
  if (query.length < 2) {
    return [];
  }

  const response = await fetch(
    `https://huggingface.co/api/models?search=${query}&limit=100&sort=downloads&direction=-1`
  );
  if (!response.ok) {
    throw new Error("Failed to fetch models");
  }
  const data: HuggingFaceSearchResult[] = await response.json();
  return data;
};

const styles = (theme: Theme) =>
  css({
    "&": {
      backgroundColor: theme.vars.palette.background.paper,
      padding: theme.spacing(2),
      marginBottom: "1em",
      borderRadius: theme.vars.rounded.container,
      border: `1px solid ${theme.vars.palette.divider}`
    },
    ".download-button": {
      margin: ".1em 0 1em 0",
      lineHeight: "1.2em",
      color: theme.vars.palette.text.primary
    },
    ".download-info": {
      color: theme.vars.palette.warning.main
    },
    ".search-results": {
      marginTop: theme.spacing(2)
    },
    ".model-card": {
      cursor: "pointer",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".card-content": {
      flexGrow: 1,
      display: "flex",
      flexDirection: "column"
    },
    ".card-footer": {
      marginTop: "auto"
    }
  });

const HuggingFaceModelSearch: React.FC = () => {
  const theme = useTheme();
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const startDownload = useModelDownloadStore((state) => state.startDownload);
  const openDialog = useModelDownloadStore((state) => state.openDialog);

  const { data, isLoading, error } = useQuery({
    queryKey: ["huggingface-models", searchQuery],
    queryFn: () => searchModels(searchQuery)
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedModel) {
      startDownload(selectedModel, "hf.model");
      openDialog();
    }
  };

  const handleModelSelect = useCallback((modelId: string) => {
    setSelectedModel(modelId);
  }, []);

  const handleCardClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const modelId = event.currentTarget.dataset.modelId;
    if (modelId) {
      handleModelSelect(modelId);
    }
  }, [handleModelSelect]);

  return (
    <div css={styles(theme)}>
      <form onSubmit={handleSubmit}>
        {error && <Text color="error">{error.message}</Text>}
        <TextField
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          label="Search HuggingFace Models"
          variant="filled"
          fullWidth
          margin="normal"
        />
        <EditorButton
          type="submit"
          variant="contained"
          color="primary"
          disabled={!selectedModel}
          style={{ marginTop: "1rem" }}
        >
          Download
        </EditorButton>
      </form>

      <Grid container spacing={2} className="search-results">
        {isLoading ? (
          <Text>Searching...</Text>
        ) : (
          data?.map((model) => (
            <Grid
              sx={{ gridColumn: { xs: "span 12", sm: "span 6", md: "span 4" } }}
              key={model.id}
            >
              <Card
                className="model-card"
                onClick={handleCardClick}
                data-model-id={model.id}
                variant={selectedModel === model.id ? "outlined" : "elevation"}
              >
                <CardContent className="card-content">
                  <Text size="normal" weight={600} gutterBottom>
                    {model.modelId}
                  </Text>
                  <Text
                    size="small"
                    color="secondary"
                    gutterBottom
                  >
                    {model.pipeline_tag}
                  </Text>
                  <Text size="small" noWrap>
                    {model.description}
                  </Text>
                  <Box className="card-footer">
                    <Caption color="secondary">
                      Downloads: {model.downloads.toLocaleString()}
                    </Caption>
                    <Caption
                      color="secondary"
                      sx={{ display: "block" }}
                    ></Caption>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))
        )}
      </Grid>
    </div>
  );
};

export default HuggingFaceModelSearch;
