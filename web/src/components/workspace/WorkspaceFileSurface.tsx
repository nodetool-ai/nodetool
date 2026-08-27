import { useEffect, useMemo } from "react";

import { BASE_URL } from "../../stores/BASE_URL";
import { useAssetDownload } from "../../hooks/assets/useAssetDownload";
import {
  useWorkspaceTabsStore,
  type WorkspaceTabMode
} from "../../stores/WorkspaceTabsStore";
import ImageViewer from "../asset_viewer/ImageViewer";
import AudioViewer from "../asset_viewer/AudioViewer";
import VideoViewer from "../asset_viewer/VideoViewer";
import LazyPDFViewer from "../asset_viewer/LazyPDFViewer";
import LazyModel3DViewer from "../asset_viewer/LazyModel3DViewer";
import {
  Button,
  Caption,
  FlexColumn,
  SPACING,
  Text
} from "../ui_primitives";
import WorkspaceFileText from "./WorkspaceFileText";
import { isTextKind, workspaceFileKind } from "./workspaceFileKind";
import {
  parseWorkspaceFileRef,
  workspaceFileDownloadPath,
  workspaceFileName
} from "./workspaceFileRef";

interface WorkspaceFileSurfaceProps {
  /** `${workspaceId}::${path}` — see workspaceFileRef.ts. */
  refId: string;
  mode: WorkspaceTabMode;
  active: boolean;
}

const BinaryFallback = ({ name, url }: { name: string; url: string }) => {
  const { handleDownload } = useAssetDownload({ url });
  return (
    <FlexColumn
      fullWidth
      fullHeight
      align="center"
      justify="center"
      gap={SPACING.md}
    >
      <Text size="normal" weight={600}>
        {name}
      </Text>
      <Caption>No preview available for this file type.</Caption>
      <Button variant="outlined" size="small" onClick={handleDownload}>
        Download
      </Button>
    </FlexColumn>
  );
};

/**
 * The document surface for a workspace file tab. The ref carries the workspace
 * id and the workspace-relative path; the filename picks the viewer. Media, PDF
 * and 3D files stream from the REST download endpoint; text files are read and
 * written through the `workspace` tRPC router (see WorkspaceFileText).
 */
const WorkspaceFileSurface = ({ refId, mode }: WorkspaceFileSurfaceProps) => {
  const setTabTitle = useWorkspaceTabsStore((state) => state.setTitle);
  const parsed = useMemo(() => parseWorkspaceFileRef(refId), [refId]);
  const name = parsed ? workspaceFileName(parsed.path) : "";

  useEffect(() => {
    if (name) {
      setTabTitle(refId, "workspace-file", name);
    }
  }, [name, refId, setTabTitle]);

  if (!parsed) {
    return (
      <FlexColumn fullWidth fullHeight align="center" justify="center">
        <Text size="normal" weight={600}>
          Invalid workspace file reference
        </Text>
      </FlexColumn>
    );
  }

  const { workspaceId, path } = parsed;
  const kind = workspaceFileKind(name);
  const url = `${BASE_URL}${workspaceFileDownloadPath(workspaceId, path)}`;

  if (isTextKind(kind)) {
    return (
      <WorkspaceFileText
        workspaceId={workspaceId}
        path={path}
        kind={kind}
        mode={mode}
      />
    );
  }

  switch (kind) {
    case "image":
      return <ImageViewer url={url} />;
    case "audio":
      return <AudioViewer url={url} />;
    case "video":
      return <VideoViewer url={url} />;
    case "pdf":
      return <LazyPDFViewer url={url} />;
    case "model3d":
      return <LazyModel3DViewer url={url} />;
    default:
      return <BinaryFallback name={name} url={url} />;
  }
};

export default WorkspaceFileSurface;
