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
  downloaded: boolean;
  tagsExpanded: boolean;
  toggleTags: () => void;
  readmeDialogOpen: boolean;
  setReadmeDialogOpen: (open: boolean) => void;
}
const ModelCardContent = React.memo<ModelCardContentProps>(
  ({
    model,
    downloaded,
    tagsExpanded,
    toggleTags,
    readmeDialogOpen,
    setReadmeDialogOpen
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
              color: theme.vars.palette.primary.main,
              fontSize: "0.85em",
              overflowWrap: "break-word"
            }}
          >
            {model.path}
          </Typography>
        )}

        {isOllama && !downloaded && (
          <Typography
            variant="h5"
            style={{ color: theme.vars.palette.grey[400] }}
          >
            Model not downloaded
          </Typography>
        )}

        <Box>
          {model.size_on_disk && (
            <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title={"Size on disk"}>
              <Typography variant="body2" className="text-model-size">
                {formatBytes(model.size_on_disk)}
              </Typography>
            </Tooltip>
          )}
          {model.tags && (
            <Box className="tags-container">
              <Button className="pipeline-tag" onClick={toggleTags}>
                {model.pipeline_tag || "#"}
              </Button>

              <Box
                className="tags-list"
                style={{ display: tagsExpanded ? "block" : "none" }}
              >
                <Box mt={1}>
                  {model.tags.map((tag: string) => (
                    <Chip
                      className="tag"
                      key={tag}
                      label={tag}
                      size="small"
                      sx={{ margin: "2px" }}
                    />
                  ))}
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
      </CardContent>
    );
  }
);

ModelCardContent.displayName = "ModelCardContent";

export default ModelCardContent;
