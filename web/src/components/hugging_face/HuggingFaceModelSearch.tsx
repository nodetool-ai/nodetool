/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useState, useCallback } from "react";
import {
  TextField,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Box
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";

const searchModels = async (query: string) => {
  if (query.length < 2) {
    return [];
  }

  const response = await fetch(
    `https://huggingface.co/api/models?search=${query}&limit=100&sort=downloads&direction=-1`
  );
  if (!response.ok) {
    throw new Error("Failed to fetch models");
  }
  const data = await response.json();
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

  const handleCardClick = useCallback((modelId: string) => {
    return () => handleModelSelect(modelId);
  }, [handleModelSelect]);

  return (
    <div css={styles(theme)}>
      <form onSubmit={handleSubmit}>
        {error && <Typography color="error">{error.message}</Typography>}
        <TextField
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          label="Search HuggingFace Models"
          variant="filled"
          fullWidth
          margin="normal"
        />
        <Button
          type="submit"
          variant="contained"
          color="primary"
          disabled={!selectedModel}
          style={{ marginTop: "1rem" }}
        >
          Download
        </Button>
      </form>

      <Grid container spacing={2} className="search-results">
        {isLoading ? (
          <Typography>Searching...</Typography>
        ) : (
          data?.map((model: any) => (
            <Grid
              sx={{ gridColumn: { xs: "span 12", sm: "span 6", md: "span 4" } }}
              key={model.id}
            >
              <Card
                className="model-card"
                onClick={handleCardClick(model.id)}
                variant={selectedModel === model.id ? "outlined" : "elevation"}
              >
                <CardContent className="card-content">
                  <Typography variant="h6" gutterBottom>
                    {model.modelId}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="textSecondary"
                    gutterBottom
                  >
                    {model.pipeline_tag}
                  </Typography>
                  <Typography variant="body2" noWrap>
                    {model.description}
                  </Typography>
                  <Box className="card-footer">
                    <Typography variant="caption" color="textSecondary">
                      Downloads: {model.downloads.toLocaleString()}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="textSecondary"
                      display="block"
                    ></Typography>
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
