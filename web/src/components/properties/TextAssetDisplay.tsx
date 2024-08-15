import React, { useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useAssetStore } from "../../stores/AssetStore";
import { Typography } from "@mui/material";

const CHUNK_SIZE = 4096;

const fetchText = async (url: string, start: number, end: number) => {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    headers: { Range: `bytes=${start}-${end}` },
  });
  return new TextDecoder().decode(new Uint8Array(response.data));
};

interface TextAssetDisplayProps {
  assetId: string;
}

function TextAssetDisplay({ assetId }: TextAssetDisplayProps) {
  const getAsset = useAssetStore((state) => state.get);
  const observerTarget = useRef(null);

  const { data, status, error } = useQuery({
    queryKey: ["textAsset", assetId],
    queryFn: async () => {
      const asset = await getAsset(assetId);
      if (!asset?.get_url) throw new Error("Asset has no get_url");
      return fetchText(asset.get_url, 0, 16 * 1024 * 1024);
    },
  });

  if (status === "pending") return <p>Loading...</p>;
  if (status === "error")
    return <p>Error loading data: {(error as Error).message}</p>;

  return (
    <div
      style={{ height: "300px", overflow: "scroll", scrollbarWidth: "thin" }}
    >
      <Typography variant="body1">{data}</Typography>
    </div>
  );
}

export default TextAssetDisplay;
