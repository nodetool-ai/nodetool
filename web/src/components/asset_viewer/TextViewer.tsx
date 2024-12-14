/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useEffect, useState } from "react";
import { Asset } from "../../stores/ApiTypes";
import axios from "axios";
import { devError } from "../../utils/DevLog";
import { CircularProgress } from "@mui/material";

interface TextViewerProps {
  asset?: Asset;
  url?: string;
}

const styles = (theme: any) =>
  css({
    "&.text-viewer": {
      width: "calc(90vw - 200px)",
      height: "calc(90vh - 120px)",
      overflowY: "auto",
      padding: "2em 1em 4em 1em",
      margin: "2em 1em 1em 8em",
      maxWidth: "1000px",
      backgroundColor: theme.palette.c_gray1,
      scrollbarWidth: "initial"
    },
    p: {
      fontFamily: theme.fontFamily1
    },
    pre: {
      whiteSpace: "pre-wrap",
      wordWrap: "break-word",
      fontFamily: theme.fontFamily1
    },
    ".progress": {
      position: "absolute",
      top: "2em",
      left: "2em"
    }
  });

/**
 * TextViewer component, used to display a text for a given asset.
 */
const TextViewer: React.FC<TextViewerProps> = ({ asset, url }) => {
  const [document, setDocument] = useState<string | null>(null);

  useEffect(() => {
    if (!asset?.get_url) return;
    axios
      .get(asset?.get_url, {
        responseType: "text"
      })
      .then((response) => {
        setDocument(response.data);
      })
      .catch(devError);
  }, [asset?.get_url]);

  return (
    <div className="output text-viewer" css={styles}>
      {!document && <CircularProgress className="progress" />}
      <div>{document}</div>
    </div>
  );
};

export default TextViewer;
