import { memo } from "react";
import { useQuery } from "@tanstack/react-query";

import { assetOfFile } from "../../workspaces/workspaceTreeActions";
import { Caption, ResponsiveImage } from "../../ui_primitives";
import {
  resolveDocumentPath,
  useDocumentLocation
} from "../documentEditorContext";

interface DocumentImageProps {
  src: string;
  alt: string;
}

const documentImageKey = (projectId: string, path: string) =>
  ["documentImage", projectId, path] as const;

/**
 * An image in a document. A URL or `asset://` locator renders as it is; a
 * path is looked up as a file of the document's project and rendered through
 * its asset, so the stored Markdown keeps the readable relative path.
 */
const DocumentImage = ({ src, alt }: DocumentImageProps) => {
  const { projectId, path } = useDocumentLocation();
  const filePath = resolveDocumentPath(path, src);
  const lookup = useQuery({
    queryKey: documentImageKey(projectId ?? "", filePath ?? ""),
    enabled: Boolean(projectId && filePath),
    staleTime: 60_000,
    queryFn: async () => {
      const asset = await assetOfFile(projectId ?? "", filePath ?? "");
      return asset ? `asset://${asset.id}` : null;
    }
  });

  const locator = filePath === null ? src : lookup.data;
  if (!locator) {
    return (
      <Caption size="small" color="muted" component="span">
        {alt || src}
      </Caption>
    );
  }
  return (
    <ResponsiveImage
      locator={locator}
      alt={alt}
      loading="lazy"
      fit="contain"
      sx={{ display: "inline-block", maxWidth: "100%", width: "auto" }}
    />
  );
};

export default memo(DocumentImage);
