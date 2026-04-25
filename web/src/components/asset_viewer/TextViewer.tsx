/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useEffect, useState } from "react";
import { Asset } from "../../stores/ApiTypes";
import { LoadingSpinner, ScrollArea } from "../ui_primitives";

import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
interface TextViewerProps {
  asset?: Asset;
  url?: string;
}

const styles = (theme: Theme) =>
  css({
    "&.text-viewer": {
      width: "calc(90vw - 200px)",
      height: "calc(90vh - 120px)",
      padding: "2em 1em 4em 1em",
      margin: "2em 1em 1em 8em",
      maxWidth: "1000px",
      backgroundColor: theme.vars.palette.grey[800]
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
const TextViewer: React.FC<TextViewerProps> = ({ asset }) => {
  const theme = useTheme();
  const [document, setDocument] = useState<string | null>(null);

  useEffect(() => {
    if (!asset?.get_url) {return;}
    fetch(asset.get_url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.status}`);
        }
        return response.text();
      })
      .then((text) => {
        setDocument(text);
      })
      .catch(console.error);
  }, [asset?.get_url]);

  return (
    <ScrollArea className="output text-viewer" css={styles(theme)} direction="vertical">
      {!document && <LoadingSpinner className="progress" />}
      <div>{document}</div>
    </ScrollArea>
  );
};

export default TextViewer;
