import React, { useState, useCallback, useMemo, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useAssetStore } from "../../stores/AssetStore";
import { Typography, Tooltip } from "@mui/material";
import TextEditorModal from "./TextEditorModal";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { isEqual } from "lodash";

const MAX_TEXT_LENGTH = 1000;
const MAX_TEXT_HEIGHT = 50;

interface TextAssetDisplayProps {
  assetId: string;
}

const TextAssetDisplay = ({ assetId }: TextAssetDisplayProps) => {
  const getAsset = useAssetStore((state) => state.get);
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const { data, error, isLoading } = useQuery({
    queryKey: ["textAsset", assetId],
    queryFn: async () => {
      const asset = await getAsset(assetId);
      if (!asset?.get_url) throw new Error("Asset has no get_url");
      const response = await axios.get(asset.get_url, { responseType: "text" });
      return response.data;
    }
  });

  const memoizedModalText = useMemo(() => {
    return data ? data : "";
  }, [data]);

  const memoizedPreviewText = useMemo(() => {
    return data ? data.substring(0, MAX_TEXT_LENGTH) : "Loading preview...";
  }, [data]);

  return (
    <div
      style={{
        width: "100%",
        padding: ".5em",
        maxHeight: MAX_TEXT_HEIGHT,
        overflow: "auto"
      }}
    >
      <Tooltip title="Open Editor" enterDelay={TOOLTIP_ENTER_DELAY}>
        <button className="button-expand" onClick={toggleExpand}>
          {isExpanded ? "↙" : "↗"}
        </button>
      </Tooltip>
      <Typography
        className="text"
        variant="body1"
        style={{ whiteSpace: "pre-wrap" }}
      >
        {error
          ? "Error loading preview."
          : isLoading
          ? "Loading preview..."
          : memoizedPreviewText}
      </Typography>

      {isExpanded && (
        <TextEditorModal
          value={memoizedModalText}
          onClose={toggleExpand}
          propertyName="Text Asset"
          propertyDescription="READ ONLY"
          readOnly={true}
          isLoading={isLoading}
        />
      )}
    </div>
  );
};

export default memo(TextAssetDisplay, isEqual);
