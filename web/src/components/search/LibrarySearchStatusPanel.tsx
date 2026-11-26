/**
 * Library search state in Settings (docs/plans/library-search.md, D22, D25):
 * items indexed and pending, failures with their reasons, the embedding model
 * and its coverage, and the rebuild actions.
 */
import React, { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";

import {
  useLibrarySearchRebuild,
  useLibrarySearchSetup,
  useLibrarySearchStatus
} from "../../serverState/useLibrarySearch";
import ErrorBanner from "../support/ErrorBanner";
import { Caption, EditorButton, FlexColumn, FlexRow, GAP, LoadingSpinner, Text } from "../ui_primitives";

const LibrarySearchStatusPanel: React.FC = () => {
  const { t } = useTranslation();
  const { status, isLoading, isError } = useLibrarySearchStatus(true);
  const { rebuild, isPending: rebuilding } = useLibrarySearchRebuild();
  const { setUp, isPending: settingUp, error: setupError } = useLibrarySearchSetup();

  const rebuildAll = useCallback(() => void rebuild("all"), [rebuild]);
  const embedAgain = useCallback(() => void rebuild("vectors"), [rebuild]);
  const chooseLocalModel = useCallback(() => {
    if (status) {
      void setUp({ provider: status.local_model.provider, model: status.local_model.model });
    }
  }, [setUp, status]);
  const turnOff = useCallback(() => void setUp(null), [setUp]);

  if (isLoading) {
    return <LoadingSpinner size="small" />;
  }
  if (isError || !status) {
    return (
      <ErrorBanner report={{ source: "operation-failure", summary: "Library search status failed to load" }}>
        {t("librarySearch.status.loadFailed")}
      </ErrorBanner>
    );
  }

  const { items, semantic } = status;
  return (
    <FlexColumn gap={GAP.normal} data-testid="library-search-status">
      <Text size="small">
        {t("librarySearch.status.items", { ready: items.ready, total: items.total })}
      </Text>
      {items.pending > 0 && (
        <Caption>{t("librarySearch.status.pending", { count: items.pending })}</Caption>
      )}
      {items.failed > 0 && (
        <FlexColumn gap={GAP.tight}>
          <Caption color="warning">{t("librarySearch.status.failed", { count: items.failed })}</Caption>
          {status.failures.map((failure) => (
            <Caption key={failure.item_id}>
              {t("librarySearch.status.failure", { title: failure.title, error: failure.error ?? "" })}
            </Caption>
          ))}
        </FlexColumn>
      )}
      <Text size="small">
        {semantic.space
          ? t("librarySearch.status.semanticOn", { model: semantic.space })
          : t("librarySearch.status.semanticOff")}
      </Text>
      {semantic.space && (
        <Caption>
          {t("librarySearch.status.vectors", { embedded: semantic.embedded, total: status.chunks })}
        </Caption>
      )}
      {semantic.images.space && (
        <Caption>
          {t("librarySearch.status.images", {
            model: semantic.images.space,
            embedded: semantic.images.embedded,
            remaining: semantic.images.remaining
          })}
        </Caption>
      )}
      {semantic.collections.length > 1 && (
        <Caption>{t("librarySearch.status.rebuildingVectors")}</Caption>
      )}
      {setupError && (
        <ErrorBanner report={{ source: "operation-failure", summary: "Library search setup failed", errorText: setupError }}>
          {setupError}
        </ErrorBanner>
      )}
      <FlexRow gap={GAP.normal} wrap>
        {status.can_set_up && !semantic.space && (
          <EditorButton variant="outlined" density="compact" onClick={chooseLocalModel} loading={settingUp}>
            {t("librarySearch.setup.local", { size: status.local_model.download_megabytes })}
          </EditorButton>
        )}
        {status.can_set_up && semantic.space && (
          <EditorButton variant="text" density="compact" onClick={turnOff} loading={settingUp}>
            {t("librarySearch.status.turnOff")}
          </EditorButton>
        )}
        {semantic.space && (
          <EditorButton variant="text" density="compact" onClick={embedAgain} loading={rebuilding}>
            {t("librarySearch.status.embedAgain")}
          </EditorButton>
        )}
        <EditorButton variant="text" density="compact" onClick={rebuildAll} loading={rebuilding}>
          {t("librarySearch.status.rebuild")}
        </EditorButton>
      </FlexRow>
      {status.can_set_up && !semantic.space && semantic.choice !== "on" && (
        <Caption>{t("librarySearch.status.providerHint", { count: status.chunks })}</Caption>
      )}
    </FlexColumn>
  );
};

export default memo(LibrarySearchStatusPanel);
