import React, { memo, useEffect, useMemo, useState } from "react";
import {
  List,
  TextField,
  InputAdornment
} from "@mui/material";
import { EditorButton, FlexRow, Text } from "../ui_primitives";
import SearchIcon from "@mui/icons-material/Search";
import { UnifiedModel } from "../../stores/ApiTypes";
import ModelListItem from "./model_list/ModelListItem";
import { useTheme } from "@mui/material/styles";
import AnnouncementIcon from "@mui/icons-material/Announcement";
import { FolderOutlined } from "@mui/icons-material";
import {
  isFileExplorerAvailable,
  openHuggingfacePath,
  openOllamaPath
} from "../../utils/fileExplorer";
import { isLocalhost } from "../../lib/env";
import { useHfCacheStatusStore } from "../../stores/HfCacheStatusStore";
import {
  buildHfCacheRequest,
  canCheckHfCache,
  getHfCacheKey
} from "../../utils/hfCache";

interface RecommendedModelsProps {
  recommendedModels: UnifiedModel[];
  startDownload: (model: UnifiedModel) => void;
}

const RecommendedModelsInner: React.FC<RecommendedModelsProps> = ({
  recommendedModels,
  startDownload
}) => {
  const theme = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const cacheStatuses = useHfCacheStatusStore((state) => state.statuses);
  const cachePending = useHfCacheStatusStore((state) => state.pending);
  const cacheVersion = useHfCacheStatusStore((state) => state.version);
  const ensureStatuses = useHfCacheStatusStore(
    (state) => state.ensureStatuses
  );

  const filteredModels = useMemo(() => {
    if (!searchQuery) {return recommendedModels;}
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

  useEffect(() => {
    const requests = filteredModels
      .map((model) => buildHfCacheRequest(model))
      .filter((request): request is NonNullable<typeof request> => request !== null);

    if (requests.length === 0) {
      return;
    }

    void ensureStatuses(requests);
  }, [ensureStatuses, filteredModels, cacheVersion]);

  const displayModels = useMemo(() => {
    return filteredModels.map((model) => {
      const isDownloaded =
        model.type === "llama_model" || !!cacheStatuses[getHfCacheKey(model)];
      return {
        ...model,
        downloaded: isDownloaded
      } as UnifiedModel & { downloaded: boolean };
    });
  }, [cacheStatuses, filteredModels]);

  if (!recommendedModels) {
    return <div>Loading…</div>;
  }

  return (
    <>
      <FlexRow
        className="search-models-container"
        gap={2}
        align="center"
        sx={{ marginBottom: 2 }}
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
              "& .MuiOutlinedInput-notchedOutline": { border: "none " },
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
      </FlexRow>

      {displayModels.length === 0 ? (
        <Text
          sx={{ color: "var(--palette-grey-200)", ml: 2, mt: 8, mb: 8 }}
        >
          No models found{searchQuery ? ` for "${searchQuery}"` : ""}.
        </Text>
      ) : (
        <List>
          {displayModels.map((model) => {
            const cacheKey = getHfCacheKey(model);
            const isCacheable = canCheckHfCache(model);
            const isCheckingCache =
              isCacheable &&
              (cachePending[cacheKey] || cacheStatuses[cacheKey] === undefined);
            return (
              <ModelListItem
                compactView={true}
                key={model.id}
                model={model}
                onDownload={() => startDownload(model)}
                isCheckingCache={isCheckingCache}
              />
            );
          })}
        </List>
      )}
      <Text
        sx={{ marginTop: "1em", color: theme.vars.palette.grey[100] }}
        component="div"
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
      </Text>
      <Text
        sx={{
          marginTop: "0.75em",
          color: theme.vars.palette.grey[200],
          maxWidth: "52rem",
          userSelect: "text",
          cursor: "text"
        }}
        component="div"
        size="small"
      >
        Gated or private Hugging Face models need access on huggingface.co (accept
        the license or request access) plus a read token for the server process:
        set HF_TOKEN before starting NodeTool, or run huggingface-cli login once.
        If a download fails, open the progress panel and use Copy message to share
        the details.
      </Text>

      {/* Open folder buttons */}
      {isLocalhost && isFileExplorerAvailable() && (
        <FlexRow gap={2} mt={2}>
          <EditorButton
            variant="outlined"
            density="normal"
            onClick={openHuggingfacePath}
          >
            <FolderOutlined sx={{ mr: 0.5, fontSize: "1em" }} />
            Open HuggingFace folder
          </EditorButton>
          <EditorButton
            variant="outlined"
            density="normal"
            onClick={openOllamaPath}
          >
            <FolderOutlined sx={{ mr: 0.5, fontSize: "1em" }} />
            Open Ollama folder
          </EditorButton>
        </FlexRow>
      )}
    </>
  );
};

const RecommendedModels = memo(RecommendedModelsInner);
RecommendedModels.displayName = 'RecommendedModels';

export default RecommendedModels;
