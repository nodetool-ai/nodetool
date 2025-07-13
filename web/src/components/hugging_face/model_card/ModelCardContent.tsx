import React from "react";
import {
  CardContent,
  Typography,
  Box,
  Button,
  Chip,
  Tooltip
} from "@mui/material";
import { getShortModelName, formatBytes } from "../../../utils/modelFormatting";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ReadmeDialog from "../ReadmeDialog";
import { UnifiedModel } from "../../../stores/ApiTypes";

interface ModelCardContentProps {
  model: UnifiedModel;
  modelData: any;
  downloaded: boolean;
  tagsExpanded: boolean;
  toggleTags: () => void;
  readmeDialogOpen: boolean;
  setReadmeDialogOpen: (open: boolean) => void;
  sizeBytes?: number;
}
const ModelCardContent = React.memo<ModelCardContentProps>(
  ({
    model,
    modelData,
    downloaded,
    tagsExpanded,
    toggleTags,
    readmeDialogOpen,
    setReadmeDialogOpen,
    sizeBytes
  }) => {
    const isHuggingFace = model.type?.startsWith("hf.") ?? false;
    const isOllama = model.type?.toLowerCase().includes("llama_model") ?? false;

    const theme = useTheme();

    return (
      <CardContent sx={{ flexGrow: 1 }}>
        <Typography
          className="repo-name"
          variant="h4"
          component="div"
          gutterBottom
        >
          {getShortModelName(model.id)}
        </Typography>

        {model.path && (
          <Typography
            variant="h3"
            style={{
              color: theme.palette.primary.main,
              fontSize: "0.85em",
              overflowWrap: "break-word"
            }}
          >
            {model.path}
          </Typography>
        )}

        {isOllama && !downloaded && (
          <Typography variant="h5" style={{ color: theme.palette.grey[400] }}>
            Model not downloaded
          </Typography>
        )}

        {isHuggingFace && !modelData && (
          <>
            <Typography
              variant="h5"
              style={{ color: theme.palette.warning.main }}
            >
              No matching repository found.
            </Typography>
            <Button
              className="button-link"
              size="small"
              variant="contained"
              href={`https://huggingface.co/${model.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {getShortModelName(model.id)}
            </Button>
          </>
        )}

        {modelData ? (
          <>
            <Box>
              {(sizeBytes || model.size_on_disk) && (
                <Tooltip
                  enterDelay={TOOLTIP_ENTER_DELAY}
                  title={downloaded ? "Size on disk" : "Download size"}
                >
                  <Typography variant="body2" className="text-model-size">
                    {formatBytes(sizeBytes ?? model.size_on_disk)}
                  </Typography>
                </Tooltip>
              )}
              {(modelData.cardData?.tags || modelData.tags) && (
                <Box className="tags-container">
                  <Button className="pipeline-tag" onClick={toggleTags}>
                    {modelData.cardData?.pipeline_tag || "#"}
                  </Button>

                  <Box
                    className="tags-list"
                    style={{ display: tagsExpanded ? "block" : "none" }}
                  >
                    <Box mt={1}>
                      {(modelData.cardData?.tags || modelData.tags).map(
                        (tag: string) => (
                          <Chip
                            className="tag"
                            key={tag}
                            label={tag}
                            size="small"
                            sx={{ margin: "2px" }}
                          />
                        )
                      )}
                    </Box>
                  </Box>
                </Box>
              )}
            </Box>

            {isHuggingFace && (
              <Box>
                <Button
                  className="readme-toggle-button"
                  onClick={() => setReadmeDialogOpen(true)}
                >
                  <Typography>README</Typography>
                </Button>
                <ReadmeDialog
                  open={readmeDialogOpen}
                  onClose={() => setReadmeDialogOpen(false)}
                  modelId={model.id}
                />
              </Box>
            )}
          </>
        ) : (
          isHuggingFace && (
            <Box mt={2}>
              <Typography>Loading model data...</Typography>
            </Box>
          )
        )}
      </CardContent>
    );
  }
);

ModelCardContent.displayName = "ModelCardContent";

export default ModelCardContent;
