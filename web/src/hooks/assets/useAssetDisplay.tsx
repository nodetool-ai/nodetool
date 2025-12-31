import { useMemo } from "react";
import type { Asset } from "../../stores/ApiTypes";
import ImageViewer from "../../components/asset_viewer/ImageViewer";
import AudioViewer from "../../components/asset_viewer/AudioViewer";
import TextViewer from "../../components/asset_viewer/TextViewer";
import VideoViewer from "../../components/asset_viewer/VideoViewer";
import PDFViewer from "../../components/asset_viewer/PDFViewer";
import Model3DViewer from "../../components/asset_viewer/Model3DViewer";

// Helper to check if a content type or URL indicates a 3D model
const is3DModel = (type: string, url?: string): boolean => {
  const model3DTypes = ["model/gltf-binary", "model/gltf+json", "model/obj", "model/fbx"];
  if (model3DTypes.some((t) => type.includes(t))) {
    return true;
  }
  if (type.startsWith("model/")) {
    return true;
  }
  // Check file extension
  if (url) {
    const lowerUrl = url.toLowerCase();
    return (
      lowerUrl.endsWith(".glb") ||
      lowerUrl.endsWith(".gltf") ||
      lowerUrl.endsWith(".obj") ||
      lowerUrl.endsWith(".fbx")
    );
  }
  return false;
};

export function useAssetDisplay(params: {
  asset?: Asset;
  url?: string;
  contentType?: string;
}) {
  const { asset, url, contentType } = params;

  const component = useMemo(() => {
    const type = asset?.content_type || contentType || "";
    const assetUrl = asset?.get_url || url;

    if (asset) {
      if (type.startsWith("image/")) {return <ImageViewer asset={asset} />;}
      if (type.startsWith("audio/")) {return <AudioViewer asset={asset} />;}
      if (type.startsWith("text/")) {return <TextViewer asset={asset} />;}
      if (type.startsWith("video/")) {return <VideoViewer asset={asset} />;}
      if (type.startsWith("application/pdf"))
        {return <PDFViewer asset={asset} />;}
      if (is3DModel(type, assetUrl))
        {return <Model3DViewer asset={asset} />;}
    }
    if (url) {
      if (type.startsWith("image/")) {return <ImageViewer url={url} />;}
      if (type.startsWith("audio/")) {return <AudioViewer url={url} />;}
      if (type.startsWith("text/")) {return <TextViewer asset={asset} />;}
      if (type.startsWith("video/")) {return <VideoViewer url={url} />;}
      if (type.startsWith("application/pdf")) {return <PDFViewer url={url} />;}
      if (type === "document" && url?.endsWith(".pdf"))
        {return <PDFViewer url={url} />;}
      if (is3DModel(type, url))
        {return <Model3DViewer url={url} />;}
    }
    return null;
  }, [asset, url, contentType]);

  return { component } as const;
}






