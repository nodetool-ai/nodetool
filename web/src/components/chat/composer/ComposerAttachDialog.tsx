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

const TABS: { value: AttachTab; label: string }[] = [
  { value: "assets", label: "Assets" },
  { value: "entities", label: "Entities" },
  { value: "documents", label: "Documents" },
  { value: "upload", label: "Upload" }
];

/** Fixed so switching tabs never resizes the dialog. */
const PANEL_HEIGHT = 360;

type DocumentIndexEntry = documentSchemas.DocumentIndexEntry;
type DocumentEntry = DocumentIndexEntry & {
  type: Exclude<DocumentIndexEntry["type"], "entity">;
};

/**
 * The resource URI for a document index row. The index spells a mini app as
 * its tab type, `application`; the resource scheme calls it `app`.
 */
export const documentResourceUri = (entry: DocumentEntry): string =>
  `${entry.type === "application" ? "app" : entry.type}://${entry.id}`;

const AssetsTab: React.FC<{
  query: string;
  onSelect: (asset: Asset) => void;
}> = ({ query, onSelect }) => {
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
        title={query ? "No assets match" : "No assets yet"}
        description={
          query ? "Try another name." : "Upload a file or generate one first."
        }
        size="small"
      />
    );
  }
  return (
    <ScrollArea sx={{ height: PANEL_HEIGHT }} onScroll={handleScroll}>
      <FlexRow wrap gap={SPACING.xs} role="listbox" aria-label="Assets">
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
    return <Caption color="muted">No project selected.</Caption>;
  }
  if (isLoading) {
    return <LoadingSpinner size="small" text="Loading documents" />;
  }
  if (error) {
    return <Caption color="error">{error.message}</Caption>;
  }
  if (documents.length === 0) {
    return (
      <EmptyState
        variant={query ? "no-results" : "empty"}
        title={query ? "No documents match" : "No documents yet"}
        description={
          query
            ? "Try another name."
            : "Workflows, sketches, timelines, and other documents in this project show up here."
        }
        size="small"
      />
    );
  }
  return (
    <ScrollArea sx={{ height: PANEL_HEIGHT }}>
      <FlexColumn gap={SPACING.xs} aria-label="Documents">
        {documents.map((entry) => {
          const name = entry.name || "Untitled";
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
}) => (
  <Box sx={{ height: PANEL_HEIGHT }}>
    <CheckerDropzone message="Drop files here" onDrop={onUpload}>
      <FlexColumn align="center" gap={SPACING.sm}>
        <Caption color="secondary">
          Drop files here, or choose them. Uploads go to the asset library.
        </Caption>
        <UploadButton
          onFileSelect={onUpload}
          label="Choose files"
          tooltip="Choose files to upload"
          multiple
        />
      </FlexColumn>
    </CheckerDropzone>
  </Box>
);

export const ComposerAttachDialog: React.FC<ComposerAttachDialogProps> = ({
  open,
  onClose,
  onSelectAsset,
  onSelectEntity,
  onSelectDocument,
  onUploadFiles
}) => {
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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add to message"
      maxWidth="sm"
      fullWidth
      disableRestoreFocus
    >
      <FlexColumn gap={SPACING.md}>
        <TabGroup
          tabs={TABS}
          value={tab}
          onChange={handleTabChange}
          aria-label="What to add"
          size="small"
        />
        {(tab === "assets" || tab === "documents") && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={`Search ${tab}`}
            ariaLabel={`Search ${tab}`}
            size="small"
            autoFocus
            fullWidth
          />
        )}
        {tab === "assets" && <AssetsTab query={query} onSelect={pickAsset} />}
        {tab === "entities" && (
          <EntityPicker onSelect={pickEntity} height={PANEL_HEIGHT} autoFocus />
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
