/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React from "react";
import HuggingFaceModelSearch from "../hugging_face/HuggingFaceModelSearch";
import HuggingFaceDownloadDialog from "../hugging_face/HuggingFaceDownloadDialog";
import HuggingFaceModelList from "../hugging_face/HuggingFaceModelList";

const styles = (theme: any) =>
  css({
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

    ".models-list": {
      overflow: "hidden",
      backgroundColor: "transparent",
      padding: theme.spacing(2)
    }
  });

const ModelsManager: React.FC = () => {
  return (
    <div className="models-manager" css={styles}>
      <div className="download-models-section">
        <div className="models-search">
          <HuggingFaceModelSearch />
        </div>
        <div className="models-download-dialog">
          <HuggingFaceDownloadDialog />
        </div>
      </div>
      <div className="existing-models-section">
        <div className="models-list">
          <HuggingFaceModelList />
        </div>
      </div>
    </div>
  );
};

export default ModelsManager;
