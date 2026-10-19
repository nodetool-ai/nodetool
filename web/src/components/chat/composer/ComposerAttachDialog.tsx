/**
 * ComposerAttachDialog — what the composer's plus button opens.
 *
 * Four tabs pick what a message can reference: an asset from the library, a
 * library entity, a NodeTool document in the current project, or a local file
 * to upload. The dialog only picks; the composer decides what a pick becomes
 * (an attached `asset://` reference, an inline `entity://` token, or a
 * `[Name](<kind>://<id>)` link the agent reads as a resource).
 */
import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Entity } from "@nodetool-ai/protocol";
import type { documents as documentSchemas } from "@nodetool-ai/protocol/api-schemas";

import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore
} from "../../../stores/WorkspaceTabsStore";
import { trpc } from "../../../trpc/client";
import { MentionAssetTile } from "../../node_types/editing/promptComposer/MentionAssetTile";
import { useAssetMentionSearch } from "../../node_types/editing/promptComposer/useAssetMentionSearch";
import EntityPicker from "../../entities/EntityPicker";
import { TYPE_COLOR, TYPE_GLYPH } from "../../workspace/tabTypeIdentity";
import {
  AlertBanner,
  Box,
  Caption,
  Card,
  CheckerDropzone,
  Dialog,
  EmptyState,
  FlexColumn,
  FlexRow,
  Label,
  LoadingSpinner,
  ScrollArea,
  SearchInput,
  SPACING,
  TabGroup,
  UploadButton
} from "../../ui_primitives";
import type { Asset } from "../../../stores/ApiTypes";

export type AttachTab = "assets" | "entities" | "documents" | "upload";

/** A project document picked in the Documents tab, as a resource link. */
export interface AttachedDocument {
  name: string;
  /** `<kind>://<id>`, the resource URI the agent and chat renderer resolve. */
  uri: string;
}

interface ComposerAttachDialogProps {
  open: boolean;
  onClose: () => void;
  onSelectAsset: (asset: Asset) => void;
  onSelectEntity: (entity: Entity) => void;
  onSelectDocument: (document: AttachedDocument) => void;
  onUploadFiles: (files: File[]) => void;
}

/** Fixed so switching tabs never resizes the dialog. */
const PANEL_HEIGHT = 360;

type DocumentIndexEntry = documentSchemas.DocumentIndexEntry;
type DocumentEntry = DocumentIndexEntry & {
  type: Exclude<DocumentIndexEntry["type"], "entity">;
};

/**
 * The resource URI for a document index row. The index spells a mini app as
 * its tab type, `application`; the resource scheme calls it `app`. A text file
 * is an asset.
 */
export const documentResourceUri = (entry: DocumentEntry): string => {
  if (entry.type === "text") {
    return `asset://${entry.id}`;
  }
  return `${entry.type === "application" ? "app" : entry.type}://${entry.id}`;
};

const AssetsTab: React.FC<{
  query: string;
  onSelect: (asset: Asset) => void;
}> = ({ query, onSelect }) => {
  const { t } = useTranslation();
  const { displayedAssets, hasMoreSaved, loadMoreSaved, handleRename } =
    useAssetMentionSearch(query, "saved");

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      if (hasMoreSaved && el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
        loadMoreSaved();
      }
    },
    [hasMoreSaved, loadMoreSaved]
  );

  if (displayedAssets.length === 0) {
    return (
      <EmptyState
        variant={query ? "no-results" : "empty"}
        title={query ? t("i18n-next18.chat.composer.attach.noAssetsMatch") : t("i18n-next18.chat.composer.attach.noAssetsYet")}
        description={
          query ? t("i18n-next18.chat.composer.attach.tryAnotherName") : t("i18n-next18.chat.composer.attach.noAssetsDescription")
        }
        size="small"
      />
    );
  }
  return (
    <ScrollArea sx={{ height: PANEL_HEIGHT }} onScroll={handleScroll}>
      <FlexRow wrap gap={SPACING.xs} role="listbox" aria-label={t("i18n-next18.chat.composer.attach.assetsTab")}>
        {displayedAssets.map((asset) => (
          <MentionAssetTile
            key={asset.id}
            asset={asset}
            selected={false}
            onSelect={() => onSelect(asset)}
            onRename={handleRename}
          />
        ))}
      </FlexRow>
    </ScrollArea>
  );
};

const DocumentsTab: React.FC<{
  query: string;
  onSelect: (document: AttachedDocument) => void;
}> = ({ query, onSelect }) => {
  const { t } = useTranslation();
  const activeProjectId = useWorkspaceTabsStore((s) => s.activeProjectId);
  const personalProjectId = useWorkspaceTabsStore((s) => s.personalProjectId);
  const projectId =
    activeProjectId && activeProjectId !== LOOSE_PROJECT_ID
      ? activeProjectId
      : personalProjectId;
  const { data, isLoading, error } = trpc.documents.index.useQuery(
    { projectId: projectId ?? "" },
    { enabled: Boolean(projectId), staleTime: 30_000, retry: false }
  );

  // Entities have their own tab.
  const documents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.documents ?? []).filter(
      (entry): entry is DocumentEntry =>
        entry.type !== "entity" &&
        (!q || (entry.name || "").toLowerCase().includes(q))
    );
  }, [data, query]);

  if (!projectId) {
    return <Caption color="muted">{t("i18n-next18.chat.composer.attach.noProjectSelected")}</Caption>;
  }
  if (isLoading) {
    return <LoadingSpinner size="small" text={t("i18n-next18.chat.composer.attach.loadingDocuments")} />;
  }
  if (error) {
    return <AlertBanner severity="error">{error.message}</AlertBanner>;
  }
  if (documents.length === 0) {
    return (
      <EmptyState
        variant={query ? "no-results" : "empty"}
        title={query ? t("i18n-next18.chat.composer.attach.noDocumentsMatch") : t("i18n-next18.chat.composer.attach.noDocumentsYet")}
        description={
          query
            ? t("i18n-next18.chat.composer.attach.tryAnotherName")
            : t("i18n-next18.chat.composer.attach.noDocumentsDescription")
        }
        size="small"
      />
    );
  }
  return (
    <ScrollArea sx={{ height: PANEL_HEIGHT }}>
          <FlexColumn gap={SPACING.xs} aria-label={t("i18n-next18.chat.composer.attach.documentsTab")}>
        {documents.map((entry) => {
          const name = entry.name || t("i18n-next18.chat.composer.attach.untitled");
          return (
            <Card
              key={`${entry.type}:${entry.id}`}
              variant="outlined"
              padding="compact"
              clickable
              aria-label={name}
              onClick={() =>
                onSelect({ name, uri: documentResourceUri(entry) })
              }
              sx={{ minWidth: 0 }}
            >
              <FlexRow align="center" gap={SPACING.sm} sx={{ minWidth: 0 }}>
                <Box
                  component="span"
                  aria-hidden
                  sx={{ color: TYPE_COLOR[entry.type] }}
                >
                  {TYPE_GLYPH[entry.type]}
                </Box>
                <Label
                  title={name}
                  sx={{
                    mb: 0,
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}
                >
                  {name}
                </Label>
                <Caption color="secondary">{entry.type}</Caption>
              </FlexRow>
            </Card>
          );
        })}
      </FlexColumn>
    </ScrollArea>
  );
};

const UploadTab: React.FC<{ onUpload: (files: File[]) => void }> = ({
  onUpload
}) => {
  const { t } = useTranslation();
  return (
  <Box sx={{ height: PANEL_HEIGHT }}>
    <CheckerDropzone message={t("i18n-next18.chat.composer.attach.dropFilesHere")} onDrop={onUpload}>
      <FlexColumn align="center" gap={SPACING.sm}>
        <Caption color="secondary">
          {t("i18n-next18.chat.composer.attach.uploadDescription")}
        </Caption>
        <UploadButton
          onFileSelect={onUpload}
          label={t("i18n-next18.chat.composer.attach.chooseFiles")}
          tooltip={t("i18n-next18.chat.composer.attach.chooseFilesTooltip")}
          multiple
        />
      </FlexColumn>
    </CheckerDropzone>
  </Box>
  );
};

export const ComposerAttachDialog: React.FC<ComposerAttachDialogProps> = ({
  open,
  onClose,
  onSelectAsset,
  onSelectEntity,
  onSelectDocument,
  onUploadFiles
}) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<AttachTab>("assets");
  const [query, setQuery] = useState("");

  const handleTabChange = useCallback((value: string) => {
    setTab(value as AttachTab);
  }, []);

  const pickAsset = useCallback(
    (asset: Asset) => {
      onSelectAsset(asset);
      onClose();
    },
    [onSelectAsset, onClose]
  );
  const pickEntity = useCallback(
    (entity: Entity) => {
      onSelectEntity(entity);
      onClose();
    },
    [onSelectEntity, onClose]
  );
  const pickDocument = useCallback(
    (document: AttachedDocument) => {
      onSelectDocument(document);
      onClose();
    },
    [onSelectDocument, onClose]
  );
  const upload = useCallback(
    (files: File[]) => {
      if (files.length === 0) {
        return;
      }
      onUploadFiles(files);
      onClose();
    },
    [onUploadFiles, onClose]
  );

  const tabs: { value: AttachTab; label: string }[] = [
    { value: "assets", label: t("i18n-next18.chat.composer.attach.assetsTab") },
    { value: "entities", label: t("i18n-next18.chat.composer.attach.entitiesTab") },
    { value: "documents", label: t("i18n-next18.chat.composer.attach.documentsTab") },
    { value: "upload", label: t("i18n-next18.chat.composer.attach.uploadTab") }
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("i18n-next18.chat.composer.attach.dialogTitle")}
      maxWidth="sm"
      fullWidth
      disableRestoreFocus
    >
      <FlexColumn gap={SPACING.md}>
        <TabGroup
          tabs={tabs}
          value={tab}
          onChange={handleTabChange}
          aria-label={t("i18n-next18.chat.composer.attach.tabsLabel")}
          size="small"
        />
        {(tab === "assets" || tab === "documents") && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={t("i18n-next18.chat.composer.attach.searchPlaceholder", { item: t(`i18n-next18.chat.composer.attach.${tab}Tab`) })}
            ariaLabel={t("i18n-next18.chat.composer.attach.searchLabel", { item: t(`i18n-next18.chat.composer.attach.${tab}Tab`) })}
            size="small"
            autoFocus
            fullWidth
          />
        )}
        {tab === "assets" && <AssetsTab query={query} onSelect={pickAsset} />}
        {tab === "entities" && (
          <EntityPicker
            onSelect={pickEntity}
            height={PANEL_HEIGHT}
            autoFocus
            onCreateStarted={onClose}
          />
        )}
        {tab === "documents" && (
          <DocumentsTab query={query} onSelect={pickDocument} />
        )}
        {tab === "upload" && <UploadTab onUpload={upload} />}
      </FlexColumn>
    </Dialog>
  );
};

export default ComposerAttachDialog;
