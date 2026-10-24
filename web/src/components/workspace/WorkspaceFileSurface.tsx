import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { BASE_URL } from "../../stores/BASE_URL";
import { useAssetDownload } from "../../hooks/assets/useAssetDownload";
import {
  useWorkspaceTabsStore,
  type WorkspaceTab,
  type WorkspaceTabMode
} from "../../stores/WorkspaceTabsStore";
import ImageViewer from "../asset_viewer/ImageViewer";
import AudioViewer from "../asset_viewer/AudioViewer";
import VideoViewer from "../asset_viewer/VideoViewer";
import LazyPDFViewer from "../asset_viewer/LazyPDFViewer";
import LazyModel3DViewer from "../asset_viewer/LazyModel3DViewer";
import { FlexColumn, SPACING, Text, EmptyState } from "../ui_primitives";
import WorkspaceFileText from "./WorkspaceFileText";
import { WithDocumentBar, workspaceDocumentBar } from "./documentBarParts";
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
  /** The workspace tab, whose document bar tops the surface. */
  tab: WorkspaceTab;
}

const BinaryFallback = ({ name, url }: { name: string; url: string }) => {
  const { t } = useTranslation();
  const { handleDownload } = useAssetDownload({ url });
  return (
    <FlexColumn
      fullWidth
      fullHeight
      align="center"
      justify="center"
      gap={SPACING.md}
    >
      <EmptyState
        variant="no-data"
        title={name}
        description={t("i18n-next51.workspaceFile.noPreview")}
        actionText={t("i18n-next51.workspaceFile.download")}
        onAction={handleDownload}
      />
    </FlexColumn>
  );
};

/**
 * The document surface for a workspace file tab. The ref carries the workspace
 * id and the workspace-relative path; the filename picks the viewer. Media, PDF
 * and 3D files stream from the REST download endpoint; text files are read and
 * written through the `workspace` tRPC router (see WorkspaceFileText).
 *
 * A text file draws the bar with its save status, Save and Copy. A binary
 * file has nothing to edit, so its bar shows only the name.
 */
const WorkspaceFileSurface = ({
  refId,
  mode,
  tab
}: WorkspaceFileSurfaceProps) => {
  const { t } = useTranslation();
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
      <WithDocumentBar tab={tab} mode={null}>
        <FlexColumn fullWidth fullHeight align="center" justify="center">
          <Text size="normal" weight={600}>
            {t("i18n-next110.workspaceFile.invalidReference")}
          </Text>
        </FlexColumn>
      </WithDocumentBar>
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
        documentBar={workspaceDocumentBar(tab)}
      />
    );
  }

  const viewer = () => {
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

  return (
    <WithDocumentBar tab={tab} mode={null}>
      {viewer()}
    </WithDocumentBar>
  );
};

export default WorkspaceFileSurface;
