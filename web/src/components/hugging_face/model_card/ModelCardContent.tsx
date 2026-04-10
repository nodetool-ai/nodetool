import React, { useCallback } from "react";
import { CardContent } from "@mui/material";
import {
  Tooltip,
  Text,
  Chip,
  EditorButton,
  FlexColumn,
  FlexRow
} from "../../ui_primitives";
import { getShortModelName, formatBytes } from "../../../utils/modelFormatting";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";
import { useTheme } from "@mui/material/styles";
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

    const handleOpenReadme = useCallback(() => {
      setReadmeDialogOpen(true);
    }, [setReadmeDialogOpen]);

    const handleCloseReadme = useCallback(() => {
      setReadmeDialogOpen(false);
    }, [setReadmeDialogOpen]);

    return (
      <CardContent sx={{ flexGrow: 1 }}>
        <Text
          className="repo-name"
          size="big"
          component="div"
          gutterBottom
        >
          {getShortModelName(model.id)}
        </Text>

        {model.path && (
          <Text
            size="big"
            style={{
              color: theme.vars.palette.primary.main,
              fontSize: "0.85em",
              overflowWrap: "break-word"
            }}
          >
            {model.path}
          </Text>
        )}

        {isOllama && !downloaded && (
          <Text
            size="normal" weight={600}
            style={{ color: theme.vars.palette.grey[400] }}
          >
            Model not downloaded
          </Text>
        )}

        <FlexColumn gap={0.5}>
          {model.size_on_disk && (
            <Tooltip delay={TOOLTIP_ENTER_DELAY} title={"Size on disk"}>
              <Text size="small" className="text-model-size">
                {formatBytes(model.size_on_disk)}
              </Text>
            </Tooltip>
          )}
          {model.tags && (
            <FlexColumn className="tags-container" gap={0.5}>
              <EditorButton className="pipeline-tag" onClick={toggleTags}>
                {model.pipeline_tag || "#"}
              </EditorButton>

              {tagsExpanded && (
                <FlexRow className="tags-list" wrap gap={0.5} sx={{ mt: 1 }}>
                  {model.tags.map((tag: string) => (
                    <Chip
                      className="tag"
                      key={tag}
                      label={tag}
                      compact
                    />
                  ))}
                </FlexRow>
              )}
            </FlexColumn>
          )}
        </FlexColumn>

        {isHuggingFace && (
          <FlexColumn gap={0.5}>
            <EditorButton
              className="readme-toggle-button"
              onClick={handleOpenReadme}
            >
              <Text>README</Text>
            </EditorButton>
            <ReadmeDialog
              open={readmeDialogOpen}
              onClose={handleCloseReadme}
              modelId={model.id}
            />
          </FlexColumn>
        )}
      </CardContent>
    );
  }
);

ModelCardContent.displayName = "ModelCardContent";

export default ModelCardContent;
