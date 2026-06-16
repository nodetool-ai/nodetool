/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React from "react";
import { useQuery } from "@tanstack/react-query";
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

  const { data: document } = useQuery({
    queryKey: ["asset-text", asset?.get_url],
    queryFn: async () => {
      const response = await fetch(asset!.get_url!);
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
      }
      return response.text();
    },
    enabled: !!asset?.get_url,
    staleTime: Infinity
  });

  return (
    <ScrollArea className="output text-viewer" css={styles(theme)} direction="vertical">
      {!document && <LoadingSpinner className="progress" />}
      <div>{document}</div>
    </ScrollArea>
  );
};

export default TextViewer;
