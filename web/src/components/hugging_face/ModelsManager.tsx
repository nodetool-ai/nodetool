/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Dialog, DialogContent, Button } from "@mui/material";
import React, { useMemo, useState } from "react";
// import HuggingFaceModelSearch from "../hugging_face/HuggingFaceModelSearch";
// import HuggingFaceDownloadDialog from "../hugging_face/HuggingFaceDownloadDialog";
import ModelList from "./ModelList";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import RecommendedModelsDialog from "./RecommendedModelsDialog";
import useMetadataStore from "../../stores/MetadataStore";
import { UnifiedModel } from "../../stores/ApiTypes";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";

const styles = (theme: any) =>
  css({
    backgroundColor: theme.palette.c_gray1,
    "&.models-manager": {
      display: "flex",
      gap: "1em",
      padding: "1em"
    },
    ".download-models-section": {
      display: "flex",
      width: "50%",
      flexDirection: "column",
      gap: "1em",
      padding: "1em"
    },
    ".existing-models-section": {
      width: "100%",
      display: "flex",
      flexDirection: "column",
      gap: "1em",
      padding: "1em"
    },
    ".models-search": {
      maxWidth: "600px",
      overflow: "hidden",
      backgroundColor: "transparent",
      padding: theme.spacing(2)
    },
    ".modal-content": {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: "80%",
      maxWidth: "1200px",
      backgroundColor: theme.palette.background.paper,
      boxShadow: theme.shadows[24],
      borderRadius: theme.shape.borderRadius,
      outline: "none"
    },
    ".models-list-container": {
      position: "relative",
      height: "80vh",
      width: "100%"
    },
    ".close-button": {
      position: "absolute",
      right: theme.spacing(1),
      top: theme.spacing(1),
      color: theme.palette.grey[500]
    }
  });

interface ModelsManagerProps {
  open: boolean;
  onClose: () => void;
}

const ModelsManager: React.FC<ModelsManagerProps> = ({ open, onClose }) => {
  const [showRecommended, setShowRecommended] = useState(false);
  const recommended = useMetadataStore((state) => state.recommendedModels);
  const { startDownload } = useModelDownloadStore();

  const recommendedModels: UnifiedModel[] = useMemo(
    () =>
      recommended.map((model) => ({
        id: model.path ? `${model.repo_id}/${model.path}` : model.repo_id || "",
        repo_id: model.repo_id || "",
        name: model.repo_id || "",
        type: model.type || "hf.model",
        path: model.path ?? null,
        allow_patterns: model.allow_patterns ?? undefined,
        ignore_patterns: model.ignore_patterns ?? undefined
      })),
    [recommended]
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      BackdropProps={{
        style: { backgroundColor: "rgba(0, 0, 0, 0.7)" }
      }}
    >
      <DialogContent css={styles}>
        <IconButton
          aria-label="close"
          onClick={onClose}
          className="close-button"
        >
          <CloseIcon />
        </IconButton>
        <div className="models-manager">
          {/* <div className="download-models-section">
            <div className="models-search">
              <HuggingFaceModelSearch />
            </div>
            <div className="models-download-dialog">
              <HuggingFaceDownloadDialog />
            </div>
          </div> */}
          <div className="existing-models-section">
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button variant="outlined" onClick={() => setShowRecommended(true)}>
                Recommended Models
              </Button>
            </div>
            <div className="models-list-container">
              <ModelList />
            </div>
          </div>
        </div>
        <RecommendedModelsDialog
          open={showRecommended}
          onClose={() => setShowRecommended(false)}
          recommendedModels={recommendedModels}
          startDownload={startDownload}
        />
      </DialogContent>
    </Dialog>
  );
};

export default ModelsManager;
