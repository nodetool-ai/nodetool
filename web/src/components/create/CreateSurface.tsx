/**
 * The Create view: a prompt bar over a grid of image and video generations.
 *
 * It submits through `generate_media`, so a take makes no thread or message
 * row. The grid reads GenerationActivityStore, which already lists every
 * generation the app started, and fills the rest from the asset list, so the
 * view survives a reload with everything it showed.
 */
import React, { Suspense, lazy, useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";

import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useEditVideoAsset } from "../../hooks/useEditVideoAsset";
import { useAssetStore } from "../../stores/AssetStore";
import type { Asset } from "../../stores/ApiTypes";
import { useNotificationStore } from "../../stores/NotificationStore";
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
  LoadingSpinner,
  ScrollArea,
  SPACING
} from "../ui_primitives";
import CreateGridItem, { type CreateGridItemActions } from "./CreateGridItem";
import CreatePromptBar from "./CreatePromptBar";
import { generationToWorkflowGraph, retakeRequest } from "./createActions";
import type { CreateFeedItem } from "./createFeed";
import { submitCreateBatch } from "./submitCreateBatch";
import { useCreateFeed } from "./useCreateFeed";

// The viewer carries the asset editors and renderers, so it loads on first open.
const AssetViewer = lazy(() => import("../assets/AssetViewer"));

/** Narrowest tile before the grid drops a column. */
const TILE_MIN_WIDTH = 200;

const errorText = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const CreateSurface = () => {
  const { t } = useTranslation();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const feed = useCreateFeed();
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
    [addNotification, createWorkflow, editVideoAsset, fail, loadAsset, openForegroundTab, t]
  );

  const handleClose = useCallback(() => setViewing(null), []);
  const focusPrompt = useCallback(() => promptRef.current?.focus(), []);

  return (
    <FlexColumn
      fullWidth
      fullHeight
      className="create-surface"
      aria-label={t("create_view.title")}
      sx={{ overflow: "hidden" }}
    >
      <CreatePromptBar promptRef={promptRef} />
      {feed.olderError && (
        <Box sx={{ px: SPACING.lg, pb: SPACING.sm }}>
          <ErrorBanner
            report={{
              source: "operation-failure",
              summary: "Create view could not list older renders",
              errorText: feed.olderError.message
            }}
            onRetry={feed.refetchOlder}
          >
            {t("create_view.olderFailed")}
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
              title={t("create_view.empty.title")}
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
