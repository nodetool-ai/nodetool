import React, { useMemo, useState } from "react";
import {
  List,
  Typography,
  Box,
  TextField,
  InputAdornment,
  Button
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { UnifiedModel } from "../../stores/ApiTypes";
import ModelListItem from "./model_list/ModelListItem";
import { useTheme } from "@mui/material/styles";
import AnnouncementIcon from "@mui/icons-material/Announcement";
import { FolderOutlined } from "@mui/icons-material";
import { useModelBasePaths } from "../../hooks/useModelBasePaths";
import { openInExplorer } from "../../utils/fileExplorer";

interface RecommendedModelsProps {
  recommendedModels: UnifiedModel[];
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
  startDownload
}) => {
  const theme = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const { huggingfaceBasePath, ollamaBasePath } = useModelBasePaths();

  const filteredModels = useMemo(() => {
    if (!searchQuery) return recommendedModels;
    const query = searchQuery.toLowerCase();
    return recommendedModels.filter((model) => {
      const matches =
        model.name.toLowerCase().includes(query) ||
        model.id.toLowerCase().includes(query) ||
        model.pipeline_tag?.toLowerCase().includes(query) ||
        model.tags?.some((tag) => tag.toLowerCase().includes(query));

      return matches;
    });
  }, [recommendedModels, searchQuery]);

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
              backgroundColor: "var(--palette-grey-800)",
              borderRadius: "0.5em",
              border: `1px solid ${theme.vars.palette.grey[600]}`,
              "& fieldset": { border: "none " },
              "&:hover": { opacity: 0.9 },
              "&:focus": {
                backgroundColor: "var(--palette-grey-500)"
              }
            }
          }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: "var(--palette-grey-200)" }} />
                </InputAdornment>
              )
            }
          }}
        />
      </Box>

      {filteredModels.length === 0 ? (
        <Typography
          variant="body1"
          sx={{ color: "var(--palette-grey-200)", ml: 2, mt: 8, mb: 10 }}
        >
          No models found{searchQuery ? ` for "${searchQuery}"` : ""}.
        </Typography>
      ) : (
        <List>
          {filteredModels.map((model) => {
            return (
              <ModelListItem
                compactView={true}
                key={model.id}
                model={model}
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
        sx={{ marginTop: "1em", color: theme.vars.palette.grey[100] }}
      >
        <AnnouncementIcon
          fontSize="small"
          sx={{
            verticalAlign: "middle",
            marginRight: "0.5em",
            color: theme.vars.palette.warning.main
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
