import { useMemo } from "react";
import type { Asset } from "../../stores/ApiTypes";
import ImageViewer from "../../components/asset_viewer/ImageViewer";
import AudioViewer from "../../components/asset_viewer/AudioViewer";
import TextViewer from "../../components/asset_viewer/TextViewer";
import VideoViewer from "../../components/asset_viewer/VideoViewer";
import PDFViewer from "../../components/asset_viewer/PDFViewer";
import Model3DViewer from "../../components/asset_viewer/Model3DViewer";

// Helper to detect 3D model content types
const isModel3D = (type: string, url?: string): boolean => {
  // Check MIME types
  if (
    type.startsWith("model/") ||
    type === "application/octet-stream" ||
    type.includes("gltf") ||
    type.includes("glb")
  ) {
    return true;
  }
  // Check file extensions
  if (url) {
    try {
      // Extract pathname to handle URLs with query parameters or fragments
      const pathname = new URL(url, "http://localhost").pathname;
      const ext = pathname.toLowerCase().split(".").pop();
      return ["glb", "gltf", "obj", "fbx", "stl", "ply", "usdz"].includes(
        ext || ""
      );
    } catch {
      // If URL parsing fails, fall back to simple extension check
      const ext = url.toLowerCase().split(".").pop()?.split("?")[0];
      return ["glb", "gltf", "obj", "fbx", "stl", "ply", "usdz"].includes(
        ext || ""
      );
    }
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
    if (asset) {
      if (type.startsWith("image/")) {
        return <ImageViewer asset={asset} />;
      }
      if (type.startsWith("audio/")) {
        return <AudioViewer asset={asset} />;
      }
      if (type.startsWith("text/")) {
        return <TextViewer asset={asset} />;
      }
      if (type.startsWith("video/")) {
        return <VideoViewer asset={asset} />;
      }
      if (type.startsWith("application/pdf")) {
        return <PDFViewer asset={asset} />;
      }
      if (isModel3D(type, asset.get_url ?? undefined)) {
        return <Model3DViewer asset={asset} />;
      }
    }
    if (url) {
      if (type.startsWith("image/")) {
        return <ImageViewer url={url} />;
      }
      if (type.startsWith("audio/")) {
        return <AudioViewer url={url} />;
      }
      if (type.startsWith("text/")) {
        return <TextViewer asset={asset} />;
      }
      if (type.startsWith("video/")) {
        return <VideoViewer url={url} />;
      }
      if (type.startsWith("application/pdf")) {
        return <PDFViewer url={url} />;
      }
      if (type === "document" && url?.endsWith(".pdf")) {
        return <PDFViewer url={url} />;
      }
      if (isModel3D(type, url)) {
        return <Model3DViewer url={url} />;
      }
    }
    return null;
  }, [asset, url, contentType]);

  return { component } as const;
}
