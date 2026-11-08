/**
 * A Create tab: a prompt bar over a grid of image, video and audio takes.
 *
 * A tab is a Create session, a thread row of kind "create". It submits
 * through `generate_media`, one request per take, each tagged with the
 * session's thread, so a take makes no message row and a running render is
 * not stopped by a chat. The grid shows the session's takes (This tab) or
 * every take (All takes). It reads GenerationActivityStore, which lists every
 * generation the app started, and fills the rest from the server, so the tab
 * survives a reload with everything it showed.
 *
 * The Create view opened before tabs had sessions has no thread, and always
 * shows every take.
 */
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";

import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useEditVideoAsset } from "../../hooks/useEditVideoAsset";
import { useAssetStore } from "../../stores/AssetStore";
import type { Asset } from "../../stores/ApiTypes";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  GLOBAL_CREATE_SESSION,
  createDraftOf,
  useCreateViewStore,
  type CreateKind,
  type CreateScope
} from "../../stores/CreateViewStore";
import {
  creationProjectId,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import ErrorBanner from "../support/ErrorBanner";
import {
  AutoGrid,
  Box,
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  ScrollArea,
  SPACING,
  ToggleGroup,
  ToggleOption
} from "../ui_primitives";
import CreateGridItem, { type CreateGridItemActions } from "./CreateGridItem";
import CreatePromptBar from "./CreatePromptBar";
import { generationToWorkflowGraph, referenceFromItem, retakeRequest } from "./createActions";
import type { CreateFeedItem } from "./createFeed";
import { nameSessionAfterPrompt } from "./openCreateSession";
import { submitCreateBatch } from "./submitCreateBatch";
import { useCreateFeed } from "./useCreateFeed";

// The viewer carries the asset editors and renderers, so it loads on first open.
const AssetViewer = lazy(() => import("../assets/AssetViewer"));

/** Narrowest tile before the grid drops a column. */
const TILE_MIN_WIDTH = 200;

const errorText = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

interface CreateSurfaceProps {
  /** The session's thread id, or null for the Create view that has none. */
  sessionId?: string | null;
  /** The project the session's takes are filed into. */
  projectId?: string;
  /**
   * Set when the session is a media thread from before Create sessions. Its
   * tab starts in that kind and keeps the thread's title.
   */
  mediaThreadKind?: CreateKind;
}

const CreateSurface = ({ sessionId = null, projectId, mediaThreadKind }: CreateSurfaceProps) => {
  const { t } = useTranslation();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const draftId = sessionId ?? GLOBAL_CREATE_SESSION;
  useEffect(() => {
    if (!sessionId || !mediaThreadKind) {
      return;
    }
    const store = useCreateViewStore.getState();
    if (!store.drafts[sessionId]) {
      store.startSession(sessionId, { mode: mediaThreadKind });
    }
    store.markTitled(sessionId);
  }, [sessionId, mediaThreadKind]);
  const scope = useCreateViewStore((s) => createDraftOf(s, draftId).scope);
  const setScope = useCreateViewStore((s) => s.setScope);
  const showsSession = sessionId !== null && scope === "session";
  const feed = useCreateFeed(showsSession ? sessionId : null);
  const requestTags = useMemo(
    () =>
      sessionId
        ? { thread_id: sessionId, ...(projectId && { project_id: projectId }) }
        : undefined,
    [sessionId, projectId]
  );
  const addNotification = useNotificationStore((s) => s.addNotification);
  const createWorkflow = useWorkflowManager((s) => s.createNew);
  const openForegroundTab = useWorkspaceTabsStore((s) => s.openForegroundTab);
  const editVideoAsset = useEditVideoAsset();
  const [viewing, setViewing] = useState<Asset | null>(null);

  const fail = useCallback(
    (message: string) =>
      addNotification({ type: "error", content: message, alert: true }),
    [addNotification]
  );

  const loadAsset = useCallback(
    async (item: CreateFeedItem): Promise<Asset | null> => {
      if (item.asset) {
        return item.asset;
      }
      if (!item.assetId) {
        return null;
      }
      try {
        return await useAssetStore.getState().get(item.assetId);
      } catch (cause) {
        fail(t("create_view.item.loadFailed", { reason: errorText(cause) }));
        return null;
      }
    },
    [fail, t]
  );

  const actions = useMemo<CreateGridItemActions>(
    () => ({
      onOpen: (item) => {
        void loadAsset(item).then((asset) => asset && setViewing(asset));
      },
      onDownload: (item) => {
        const assetId = item.assetId;
        if (!assetId) {
          return;
        }
        void useAssetStore
          .getState()
          .download([assetId])
          .then(() =>
            addNotification({
              type: "success",
              content: t("create_view.item.downloaded", {
                name: item.prompt ?? assetId
              }),
              alert: true
            })
          )
          .catch((cause: unknown) =>
            fail(t("create_view.item.downloadFailed", { reason: errorText(cause) }))
          );
      },
      onRetake: (item) => {
        const request = retakeRequest(item);
        if (!request) {
          return;
        }
        void submitCreateBatch([request]).then(({ error }) => {
          if (error) {
            fail(t("create_view.retakeFailed", { reason: error.message }));
          }
        });
      },
      onSendToTimeline: (item) => {
        void loadAsset(item).then((asset) => asset && editVideoAsset(asset));
      },
      onOpenAsWorkflow: (item) => {
        void (async () => {
          try {
            const projectId = creationProjectId();
            const workflow = await createWorkflow(projectId, {
              name: item.prompt?.slice(0, 60) || t("create_view.item.workflowName"),
              graph: generationToWorkflowGraph(item)
            });
            openForegroundTab({
              type: "workflow",
              ref: workflow.id,
              mode: "edit",
              title: workflow.name,
              projectId
            });
          } catch (cause) {
            fail(t("create_view.item.workflowFailed", { reason: errorText(cause) }));
          }
        })();
      },
      onUseAsReference: (item) => {
        const reference = referenceFromItem(item, t);
        if (reference) {
          useCreateViewStore.getState().addReferences(draftId, [reference]);
          promptRef.current?.focus();
        }
      },
      onStartFrom: (item, mode) => {
        const reference = referenceFromItem(item, t);
        if (!reference) {
          return;
        }
        const store = useCreateViewStore.getState();
        store.setMode(draftId, mode);
        store.clearReferences(draftId);
        store.addReferences(draftId, [reference]);
        promptRef.current?.focus();
      },
      onOpenInSketch: (item) => {
        if (!item.assetId) {
          return;
        }
        openForegroundTab({
          type: "image",
          ref: item.assetId,
          mode: "edit",
          title: item.prompt?.slice(0, 40) || t("create_view.item.sketchTitle"),
          projectId: creationProjectId()
        });
      },
      onReusePrompt: (item) => {
        if (item.prompt) {
          useCreateViewStore.getState().setPrompt(draftId, item.prompt);
          promptRef.current?.focus();
        }
      },
      onStop: async (item) => {
        if (!item.generation) {
          return;
        }
        try {
          // Loaded on use: the tracker pulls in the chat store.
          const { cancelGeneration } = await import(
            "../../hooks/useGenerationActivityTracking"
          );
          await cancelGeneration(item.generation);
        } catch (cause) {
          fail(t("generations.stopFailed") + ` ${errorText(cause)}`);
        }
      }
    }),
    [addNotification, createWorkflow, draftId, editVideoAsset, fail, loadAsset, openForegroundTab, t]
  );

  const handleClose = useCallback(() => setViewing(null), []);
  const focusPrompt = useCallback(() => promptRef.current?.focus(), []);
  const handleSent = useCallback(
    (prompt: string) => {
      if (sessionId) {
        void nameSessionAfterPrompt(sessionId, prompt).catch((cause: unknown) =>
          fail(t("create_view.renameFailed", { reason: errorText(cause) }))
        );
      }
    },
    [fail, sessionId, t]
  );
  const handleScope = useCallback(
    (_event: React.MouseEvent<HTMLElement>, next: CreateScope | null) => {
      if (next) {
        setScope(draftId, next);
      }
    },
    [draftId, setScope]
  );

  return (
    <FlexColumn
      fullWidth
      fullHeight
      className="create-surface"
      aria-label={t("create_view.title")}
      sx={{ overflow: "hidden" }}
    >
      <CreatePromptBar
        promptRef={promptRef}
        sessionId={draftId}
        requestTags={requestTags}
        onSent={handleSent}
      />
      {sessionId !== null && (
        <FlexRow justify="flex-end" sx={{ px: SPACING.lg, pb: SPACING.sm }}>
          <ToggleGroup
            segmented
            exclusive
            size="small"
            value={scope}
            onChange={handleScope}
            aria-label={t("create_view.scope.label")}
          >
            <ToggleOption value="session">{t("create_view.scope.session")}</ToggleOption>
            <ToggleOption value="all">{t("create_view.scope.all")}</ToggleOption>
          </ToggleGroup>
        </FlexRow>
      )}
      {feed.olderError && (
        <Box sx={{ px: SPACING.lg, pb: SPACING.sm }}>
          <ErrorBanner
            report={{
              source: "operation-failure",
              summary: showsSession
                ? "Create tab could not list its takes"
                : "Create view could not list older renders",
              errorText: feed.olderError.message
            }}
            onRetry={feed.refetchOlder}
          >
            {t(showsSession ? "create_view.sessionFailed" : "create_view.olderFailed")}
          </ErrorBanner>
        </Box>
      )}
      <ScrollArea sx={{ flex: 1, minHeight: 0, px: SPACING.lg, pb: SPACING.lg }}>
        {feed.items.length === 0 ? (
          feed.loadingOlder ? (
            <LoadingSpinner />
          ) : (
            <EmptyState
              icon={<AutoAwesomeOutlinedIcon />}
              title={t(showsSession ? "create_view.empty.sessionTitle" : "create_view.empty.title")}
              description={t("create_view.empty.description")}
              actionText={t("create_view.empty.action")}
              onAction={focusPrompt}
            />
          )
        ) : (
          <AutoGrid
            minItemWidth={TILE_MIN_WIDTH}
            gap={SPACING.sm}
            role="list"
            aria-label={t("create_view.gridLabel")}
          >
            {feed.items.map((item) => (
              <Box key={item.key} role="listitem" sx={{ minWidth: 0 }}>
                <CreateGridItem item={item} actions={actions} />
              </Box>
            ))}
          </AutoGrid>
        )}
      </ScrollArea>
      {viewing && (
        <ContextMenuProvider active={false}>
          <Suspense fallback={null}>
            <AssetViewer asset={viewing} open onClose={handleClose} />
          </Suspense>
        </ContextMenuProvider>
      )}
    </FlexColumn>
  );
};

export default React.memo(CreateSurface);
