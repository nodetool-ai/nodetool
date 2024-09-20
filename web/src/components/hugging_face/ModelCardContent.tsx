import React from "react";
import {
  CardContent,
  Typography,
  Box,
  Button,
  Chip,
  Tooltip
} from "@mui/material";
import { formatId, modelSize, renderModelSecondaryInfo } from "./ModelUtils";
import { TOOLTIP_ENTER_DELAY } from "../node/BaseNode";
import ThemeNodetool from "../themes/ThemeNodetool";
import ReadmeDialog from "./ReadmeDialog";
import { UnifiedModel } from "../../stores/ApiTypes";

interface ModelCardContentProps {
  model: UnifiedModel;
  modelData: any;
  downloaded: boolean;
  tagsExpanded: boolean;
  toggleTags: () => void;
  readmeDialogOpen: boolean;
  setReadmeDialogOpen: (open: boolean) => void;
}
const ModelCardContent = React.memo<ModelCardContentProps>(
  ({
    model,
    modelData,
    downloaded,
    tagsExpanded,
    toggleTags,
    readmeDialogOpen,
    setReadmeDialogOpen
  }) => {
    const isHuggingFace = model.type.startsWith("hf.");
    const isOllama = model.type.toLowerCase().includes("llama_model");
    if (!modelData) {
      return (
        <CardContent sx={{ flexGrow: 1 }}>
          <Typography
            className="repo-name"
            variant="h4"
            component="div"
            gutterBottom
          >
            {formatId(model.id)}
          </Typography>
          {model.path && (
            <Typography
              variant="h3"
              style={{
                color: ThemeNodetool.palette.c_gray3,
                fontSize: "0.75em"
              }}
            >
              {model.path}
            </Typography>
          )}
          {isOllama && (
            <Typography
              variant="h5"
              style={{ color: ThemeNodetool.palette.c_gray4 }}
            >
              Model not downloaded
            </Typography>
          )}
          {isHuggingFace && (
            <>
              <Typography
                variant="h5"
                style={{ color: ThemeNodetool.palette.c_warning }}
              >
                Failed to find matching repository:
              </Typography>
              <Button
                className="button-link"
                size="small"
                variant="contained"
                href={`https://huggingface.co/${model.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {model.id}
              </Button>
            </>
          )}
        </CardContent>
      );
    }

    return (
      <CardContent sx={{ flexGrow: 1 }}>
        <Typography
          className="repo-name"
          variant="h4"
          component="div"
          gutterBottom
        >
          {formatId(model.id)}
        </Typography>

        {renderModelSecondaryInfo(modelData, isHuggingFace)}

        <Box>
          {model.size_on_disk && (
            <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title={"Size on disk"}>
              <Typography variant="body2" className="text-model-size">
                {modelSize(model)}
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

        {isHuggingFace && model.path && (
          <Box mt={1}>
            <Typography
              variant="h3"
              style={{
                color: ThemeNodetool.palette.c_gray4,
                fontSize: "0.75em"
              }}
            >
              {model.path}
            </Typography>
          </Box>
        )}

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
