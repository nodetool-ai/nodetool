import React from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useAssetStore } from "../../stores/AssetStore";
import { Typography } from "@mui/material";
import { devError } from "../../utils/DevLog";

const fetchText = async (url: string) => {
  const response = await axios.get(url, { responseType: "text" });
  return response.data;
};

interface TextAssetDisplayProps {
  assetId: string;
}

function TextAssetDisplay({ assetId }: TextAssetDisplayProps) {
  const getAsset = useAssetStore((state) => state.get);

  const { data, status, error } = useQuery({
    queryKey: ["textAsset", assetId],
    queryFn: async () => {
      try {
        const asset = await getAsset(assetId);
        if (!asset?.get_url) throw new Error("Asset has no get_url");
        const text = await fetchText(asset.get_url);
        return text;
      } catch (err) {
        if (axios.isAxiosError(err)) {
          devError("TextAssetDisplay Response status:", err.response?.status);
          devError("TextAssetDisplay Response headers:", err.response?.headers);
          devError("TextAssetDisplay Response data:", err.response?.data);
        }
        throw err;
      }
    },
    retry: 2
  });

  if (status === "pending") return <p>...</p>;
  if (status === "error")
    return <p>Error loading data: {(error as Error).message}</p>;

  return (
    <div style={{ padding: "16px" }}>
      <Typography variant="body1">{data}</Typography>
    </div>
  );
}

export default TextAssetDisplay;
