/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useMediaQuery } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

import { useAssetById } from "../../serverState/useAssetById";
import { useAssetStore } from "../../stores/AssetStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  useWorkspaceTabsStore,
  type WorkspaceTab,
  type WorkspaceTabMode
} from "../../stores/WorkspaceTabsStore";
import ErrorBanner from "../support/ErrorBanner";
import {
  FlexColumn,
  LoadingSpinner,
  ResizableDock,
  SaveStatus,
  ToolbarIconButton,
  UndoRedoButtons,
  EmptyState
} from "../ui_primitives";
import MonacoPane from "./MonacoPane";
import SvgPreview from "./SvgPreview";
import AssetAgentPanel from "./AssetAgentPanel";
import { setSvgAgentHandler, type SvgSnapshot } from "./svgAgentBridge";
import {
  DocumentSaveButton,
  WithDocumentBar,
  explicitSaveStatus,
  useMonacoHistory
} from "./documentBarParts";

const SVG_CONTENT_TYPE = "image/svg+xml";

interface SvgSurfaceProps {
  refId: string;
  mode: WorkspaceTabMode;
  /**
   * Part of the surface contract. Unused: nothing here drives a singleton
   * store, so an inactive tab can stay mounted with its editor live.
   */
  active: boolean;
  /** The workspace tab, whose document bar tops the surface. */
  tab: WorkspaceTab;
}

const svgAssetKey = (id: string) => ["svgAsset", id] as const;

const ASSISTANT_WIDTH = 340;

const styles = (theme: Theme) =>
  css({
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    backgroundColor: theme.vars.palette.background.default,
    ".panes": {
      flex: 1,
      minHeight: 0,
      display: "flex"
    },
    ".source-pane": {
      flex: "1 1 50%",
      minWidth: 0,
      position: "relative",
      borderRight: `1px solid ${theme.vars.palette.divider}`
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
 * renders to. Saving writes the markup back to the asset. In edit mode the
 * document bar carries the save status, Undo/Redo of the markup, Save, and the
 * assistant toggle. The assistant edits the same draft through the `ui_svg_*`
 * tools, which this surface serves while it is in edit mode.
 */
const SvgSurface = ({ refId, mode, tab }: SvgSurfaceProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const surfaceStyles = useMemo(() => styles(theme), [theme]);
  const queryClient = useQueryClient();
  const { data: asset, isLoading, error } = useAssetById(refId);
  const setTabTitle = useWorkspaceTabsStore((state) => state.setTitle);
  const update = useAssetStore((state) => state.update);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const history = useMonacoHistory();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [content, setContent] = useState<string | null>(null);
  const [savedContent, setSavedContent] = useState<string | null>(null);
  // The agent tools read and write between renders, so they go through refs.
  const contentRef = useRef(content);
  contentRef.current = content;
  const savedContentRef = useRef(savedContent);
  savedContentRef.current = savedContent;

  useEffect(() => {
    if (!asset) return;
    setTabTitle(refId, "svg", asset.name || t("i18n-next51.svg.untitled"));
  }, [asset, refId, setTabTitle, t]);

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

  const saveAsync = saveMutation.mutateAsync;
  const assetName = asset?.name ?? "";
  const loaded = content !== null;
  useEffect(() => {
    if (mode !== "edit" || !loaded) return;
    const snapshot = (): SvgSnapshot => {
      const markup = contentRef.current ?? "";
      return {
        assetId: refId,
        name: assetName,
        markup,
        dirty: markup !== savedContentRef.current
      };
    };
    const handler = {
      getSnapshot: snapshot,
      setMarkup: (markup: string) => {
        contentRef.current = markup;
        setContent(markup);
        return snapshot();
      },
      save: async () => {
        const markup = contentRef.current;
        if (markup !== null && markup !== savedContentRef.current) {
          await saveAsync(markup);
          savedContentRef.current = markup;
        }
        return snapshot();
      }
    };
    setSvgAgentHandler(refId, handler);
    return () => setSvgAgentHandler(refId, null);
  }, [mode, loaded, refId, assetName, saveAsync]);

  const body = () => {
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
          {error ? (
            <ErrorBanner
              report={{
                source: "operation-failure",
                summary: "SVG asset failed to load",
                errorText: error.message
              }}
            >
              {t("i18n-next51.svg.loadError")}
            </ErrorBanner>
          ) : (
            <EmptyState
              variant="no-data"
              title={t("i18n-next51.svg.notFound")}
              description={t("i18n-next51.svg.mayHaveBeenDeleted")}
            />
          )}
        </FlexColumn>
      );
    }

    if (markupError) {
      return (
        <FlexColumn fullWidth fullHeight align="center" justify="center">
          <ErrorBanner
            report={{
              source: "operation-failure",
              summary: "SVG content failed to load",
              errorText: markupError.message
            }}
          >
            {t("i18n-next51.svg.contentLoadError")}
          </ErrorBanner>
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
        <div className="panes">
          <div className="source-pane">
            <MonacoPane
              value={content}
              language="xml"
              onChange={setContent}
              onSave={handleSave}
              onEditorMount={history.onEditorMount}
            />
          </div>
          <div className="preview-pane">
            <SvgPreview markup={content} />
          </div>
          {assistantOpen && !isMobile && (
            <ResizableDock
              storageKey="svg_assistant"
              defaultWidth={ASSISTANT_WIDTH}
              ariaLabel={t("i18n-next51.svg.resizeAssistant")}
            >
              <FlexColumn
                fullWidth
                sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}
              >
                <AssetAgentPanel
                  type="svg"
                  assetId={refId}
                  title={asset.name}
                />
              </FlexColumn>
            </ResizableDock>
          )}
        </div>
      </div>
    );
  };

  const editing = mode === "edit" && content !== null;
  return (
    <WithDocumentBar
      tab={tab}
      status={
        editing ? (
          <SaveStatus
            state={explicitSaveStatus({
              saving: isSaving,
              dirty: isDirty,
              failed: saveMutation.isError
            })}
            onRetry={handleSave}
          />
        ) : undefined
      }
      view={
        editing && !isMobile ? (
          <ToolbarIconButton
            icon={<AutoAwesomeIcon />}
            tooltip={t("i18n-next51.svg.assistant")}
            active={assistantOpen}
            aria-pressed={assistantOpen}
            onClick={() => setAssistantOpen((open) => !open)}
          />
        ) : undefined
      }
      history={
        editing ? (
          <UndoRedoButtons
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={history.undo}
            onRedo={history.redo}
          />
        ) : undefined
      }
      actions={
        editing ? (
          <DocumentSaveButton
            onSave={handleSave}
            saving={isSaving}
            disabled={!isDirty}
          />
        ) : undefined
      }
    >
      {body()}
    </WithDocumentBar>
  );
};

export default SvgSurface;
