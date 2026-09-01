/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import SaveIcon from "@mui/icons-material/Save";

import { useAssetById } from "../../serverState/useAssetById";
import { useAssetStore } from "../../stores/AssetStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  useWorkspaceTabsStore,
  type WorkspaceTabMode
} from "../../stores/WorkspaceTabsStore";
import {
  BORDER_RADIUS,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  Text
} from "../ui_primitives";
import MonacoPane from "./MonacoPane";
import SvgPreview from "./SvgPreview";

const SVG_CONTENT_TYPE = "image/svg+xml";

interface SvgSurfaceProps {
  refId: string;
  mode: WorkspaceTabMode;
  /**
   * Part of the surface contract. Unused: nothing here drives a singleton
   * store, so an inactive tab can stay mounted with its editor live.
   */
  active: boolean;
}

const svgAssetKey = (id: string) => ["svgAsset", id] as const;

const styles = (theme: Theme) =>
  css({
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    backgroundColor: theme.vars.palette.grey[900],
    ".toolbar": {
      flex: "0 0 auto",
      padding: theme.spacing(0.5, 1),
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`
    },
    ".dirty-dot": {
      width: 8,
      height: 8,
      borderRadius: BORDER_RADIUS.circle,
      backgroundColor: theme.vars.palette.warning.main,
      flex: "0 0 auto"
    },
    ".panes": {
      flex: 1,
      minHeight: 0,
      display: "flex"
    },
    ".source-pane": {
      flex: "1 1 50%",
      minWidth: 0,
      position: "relative",
      borderRight: `1px solid ${theme.vars.palette.grey[700]}`
    },
    ".preview-pane": {
      flex: "1 1 50%",
      minWidth: 0
    }
  });

/**
 * The document surface for an SVG asset tab. `refId` is an Asset id.
 *
 * An SVG is a picture and a text file at once, which is why it has a surface of
 * its own rather than sharing the image tab: view mode paints the vector, edit
 * mode puts the markup in Monaco beside a live preview of what the unsaved text
 * renders to. Saving writes the markup back to the asset.
 */
const SvgSurface = ({ refId, mode }: SvgSurfaceProps) => {
  const theme = useTheme();
  const surfaceStyles = useMemo(() => styles(theme), [theme]);
  const queryClient = useQueryClient();
  const { data: asset, isLoading, error } = useAssetById(refId);
  const setTabTitle = useWorkspaceTabsStore((state) => state.setTitle);
  const update = useAssetStore((state) => state.update);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const [content, setContent] = useState<string | null>(null);
  const [savedContent, setSavedContent] = useState<string | null>(null);

  useEffect(() => {
    if (!asset) return;
    setTabTitle(refId, "svg", asset.name || "Untitled");
  }, [asset, refId, setTabTitle]);

  const getUrl = asset?.get_url ?? undefined;
  const {
    data: loadedMarkup,
    isLoading: markupLoading,
    error: markupError
  } = useQuery({
    queryKey: svgAssetKey(refId),
    enabled: !!getUrl,
    queryFn: async () => {
      if (!getUrl) throw new Error("SVG asset has no download URL");
      const response = await fetch(getUrl);
      if (!response.ok) {
        throw new Error(`Failed to load SVG: ${response.status}`);
      }
      return response.text();
    }
  });

  useEffect(() => {
    if (loadedMarkup === undefined) return;
    setContent((current) => (current === null ? loadedMarkup : current));
    setSavedContent((current) => (current === null ? loadedMarkup : current));
  }, [loadedMarkup]);

  // Re-derive when the tab is pointed at a different asset.
  const previousRef = useRef(refId);
  useEffect(() => {
    if (previousRef.current === refId) return;
    previousRef.current = refId;
    setContent(null);
    setSavedContent(null);
  }, [refId]);

  const saveMutation = useMutation({
    mutationFn: (markup: string) =>
      update({
        id: refId,
        data: markup,
        content_type: asset?.content_type ?? SVG_CONTENT_TYPE
      }),
    onSuccess: (_asset, markup) => {
      setSavedContent(markup);
      queryClient.setQueryData(svgAssetKey(refId), markup);
      addNotification({
        type: "success",
        alert: true,
        content: `Saved ${asset?.name ?? "SVG"}`,
        dismissable: false
      });
    },
    onError: (saveError) => {
      addNotification({
        type: "error",
        alert: true,
        content: `Failed to save SVG: ${saveError.message}`,
        dismissable: false
      });
    }
  });

  const isDirty = content !== null && content !== savedContent;
  const isSaving = saveMutation.isPending;

  const handleSave = useCallback(() => {
    if (content === null || content === savedContent || isSaving) return;
    saveMutation.mutate(content);
  }, [content, savedContent, isSaving, saveMutation]);

  if (isLoading) {
    return (
      <FlexColumn fullWidth fullHeight align="center" justify="center">
        <LoadingSpinner />
      </FlexColumn>
    );
  }

  if (error || !asset) {
    return (
      <FlexColumn fullWidth fullHeight align="center" justify="center">
        <Text size="normal" weight={600}>
          {error ? "Failed to load SVG" : "SVG not found"}
        </Text>
      </FlexColumn>
    );
  }

  if (markupError) {
    return (
      <FlexColumn fullWidth fullHeight align="center" justify="center">
        <Caption sx={{ color: "error.main" }}>
          Failed to load SVG content
        </Caption>
      </FlexColumn>
    );
  }

  if (markupLoading || content === null) {
    return (
      <FlexColumn fullWidth fullHeight align="center" justify="center">
        <LoadingSpinner />
      </FlexColumn>
    );
  }

  if (mode !== "edit") {
    return <SvgPreview markup={content} />;
  }

  return (
    <div css={surfaceStyles}>
      <FlexRow className="toolbar" align="center" justify="space-between">
        <Caption>{asset.name}</Caption>
        <FlexRow align="center" gap={0.5}>
          {isDirty && (
            <span className="dirty-dot" aria-label="Unsaved changes" />
          )}
          <EditorButton
            variant="contained"
            size="small"
            startIcon={<SaveIcon />}
            disabled={!isDirty || isSaving}
            onClick={handleSave}
          >
            {isSaving ? "Saving…" : "Save"}
          </EditorButton>
        </FlexRow>
      </FlexRow>
      <div className="panes">
        <div className="source-pane">
          <MonacoPane
            value={content}
            language="xml"
            onChange={setContent}
            onSave={handleSave}
          />
        </div>
        <div className="preview-pane">
          <SvgPreview markup={content} />
        </div>
      </div>
    </div>
  );
};

export default SvgSurface;
