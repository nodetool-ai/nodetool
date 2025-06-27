import React, { useMemo, useState } from "react";
import {
  Grid,
  List,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Box,
  TextField,
  InputAdornment,
  Tooltip,
  Button
} from "@mui/material";
import ViewListIcon from "@mui/icons-material/ViewList";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import SearchIcon from "@mui/icons-material/Search";
import { UnifiedModel } from "../../stores/ApiTypes";
import ModelCard from "./model_card/ModelCard";
import ModelListItem from "./model_list/ModelListItem";
import ThemeNodes from "../themes/ThemeNodes";
import AnnouncementIcon from "@mui/icons-material/Announcement";
import { FolderOutlined } from "@mui/icons-material";
import { useModelsWithSize } from "../../hooks/useModelsWithSize";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { useModelBasePaths } from "../../hooks/useModelBasePaths";
import { openInExplorer } from "../../utils/fileExplorer";
import { useModels } from "./model_list/useModels";

interface RecommendedModelsProps {
  recommendedModels: UnifiedModel[];
  initialViewMode?: "grid" | "list";
  startDownload: (
    repoId: string,
    modelType: string,
    path: string | null,
    allowPatterns: string[] | null,
    ignorePatterns: string[] | null
  ) => void;
}

const RecommendedModels: React.FC<RecommendedModelsProps> = ({
  recommendedModels,
  initialViewMode = "grid",
  startDownload
}) => {
  const [viewMode, setViewMode] = useState<"grid" | "list">(initialViewMode);
  const [searchQuery, setSearchQuery] = useState("");
  const modelsWithSize = useModelsWithSize(recommendedModels);
  const { downloads } = useModelDownloadStore((state) => ({
    downloads: state.downloads
  }));

  // Base paths for model caches
  const { huggingfaceBasePath, ollamaBasePath } = useModelBasePaths();

  const { hfModels, ollamaModels } = useModels();

  const downloadedModels = useMemo(
    () =>
      new Set([...(hfModels || []), ...(ollamaModels || [])].map((m) => m.id)),
    [hfModels, ollamaModels]
  );

  const handleViewModeChange = (
    event: React.MouseEvent<HTMLElement>,
    newViewMode: "grid" | "list" | null
  ) => {
    if (newViewMode !== null) {
      setViewMode(newViewMode);
    }
  };

  const filteredModels = useMemo(() => {
    if (!searchQuery) return modelsWithSize;
    const query = searchQuery.toLowerCase();
    return modelsWithSize.filter((model) => {
      const matches =
        model.name.toLowerCase().includes(query) ||
        model.id.toLowerCase().includes(query) ||
        model.pipeline_tag?.toLowerCase().includes(query) ||
        model.tags?.some((tag) => tag.toLowerCase().includes(query));

      return matches;
    });
  }, [modelsWithSize, searchQuery]);

  if (!recommendedModels) {
    return <div>Loading...</div>;
  }

  return (
    <>
      <Box
        className="search-models-container"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          marginBottom: 2
        }}
      >
        <TextField
          className="search-models-input"
          placeholder="Search models..."
          variant="outlined"
          size="small"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{
            flex: 1,
            maxWidth: "300px",
            border: "none",
            "& .MuiOutlinedInput-root": {
              backgroundColor: "var(--c_gray1)",
              border: "none",
              "& fieldset": { border: "none " },
              "&:hover": { opacity: 0.9 },
              "&:focus": {
                backgroundColor: "var(--c_gray3)"
              }
            }
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: "var(--c_gray5)" }} />
              </InputAdornment>
            )
          }}
        />
        <ToggleButtonGroup
          className="view-mode-toggle"
          value={viewMode}
          exclusive
          onChange={handleViewModeChange}
          aria-label="view mode"
          size="small"
          sx={{
            width: "fit-content",
            padding: "0.5em",
            marginLeft: "auto"
          }}
        >
          <Tooltip title="Grid view">
            <ToggleButton
              value="grid"
              aria-label="grid view"
              sx={{
                backgroundColor: "var(--c_gray1)",
                "&:hover": {
                  backgroundColor: "var(--c_gray2)"
                }
              }}
            >
              <ViewModuleIcon />
            </ToggleButton>
          </Tooltip>
          <Tooltip title="List view">
            <ToggleButton
              value="list"
              aria-label="list view"
              sx={{
                backgroundColor: "var(--c_gray1)",
                "&:hover": {
                  backgroundColor: "var(--c_gray2)"
                }
              }}
            >
              <ViewListIcon />
            </ToggleButton>
          </Tooltip>
        </ToggleButtonGroup>
      </Box>

      {filteredModels.length === 0 ? (
        <Typography
          variant="body1"
          sx={{ color: "var(--c_gray5)", ml: 2, mt: 8, mb: 10 }}
        >
          No models found{searchQuery ? ` for "${searchQuery}"` : ""}.
        </Typography>
      ) : viewMode === "grid" ? (
        <Grid container spacing={3} className="recommended-models-grid">
          {filteredModels.map((model) => {
            const isDownloaded = downloadedModels.has(model.id);
            return (
              <Grid item xs={12} sm={6} md={4} key={model.id}>
                <ModelCard
                  model={{ ...model, downloaded: isDownloaded }}
                  onDownload={() =>
                    startDownload(
                      model.repo_id || "",
                      model.type || "",
                      model.path ?? null,
                      model.allow_patterns ?? null,
                      model.ignore_patterns ?? null
                    )
                  }
                />
              </Grid>
            );
          })}
        </Grid>
      ) : (
        <List>
          {filteredModels.map((model) => {
            const isDownloaded = downloadedModels.has(model.id);
            return (
              <ModelListItem
                compactView={true}
                key={model.id}
                model={{ ...model, downloaded: isDownloaded }}
                onDownload={() =>
                  startDownload(
                    model.repo_id || "",
                    model.type || "hf.model",
                    model.path ?? null,
                    model.allow_patterns ?? null,
                    model.ignore_patterns ?? null
                  )
                }
              />
            );
          })}
        </List>
      )}
      <Typography
        variant="body1"
        sx={{ marginTop: "1em", color: ThemeNodes.palette.c_gray6 }}
      >
        <AnnouncementIcon
          fontSize="small"
          sx={{
            verticalAlign: "middle",
            marginRight: "0.5em",
            color: ThemeNodes.palette.c_warning
          }}
        />
        Models will be downloaded to your local cache folder in the standard
        location for Huggingface and Ollama.
      </Typography>

      {/* Open folder buttons */}
      <Box mt={2} sx={{ display: "flex", gap: 2 }}>
        <Button
          variant="outlined"
          startIcon={<FolderOutlined />}
          onClick={() =>
            huggingfaceBasePath && openInExplorer(huggingfaceBasePath)
          }
          disabled={!huggingfaceBasePath}
        >
          Open HuggingFace folder
        </Button>
        <Button
          variant="outlined"
          startIcon={<FolderOutlined />}
          onClick={() => ollamaBasePath && openInExplorer(ollamaBasePath)}
          disabled={!ollamaBasePath}
        >
          Open Ollama folder
        </Button>
      </Box>
    </>
  );
};

export default RecommendedModels;
