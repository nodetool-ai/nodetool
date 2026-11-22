/**
 * The document's stored versions (document editor PRD R11), docked beside
 * the page. Lists each version with its cause, previews its Markdown, saves
 * a named version and restores one. A restore keeps the current content as
 * a version first, so it can be undone from this list.
 */
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useTextDocumentVersionContent,
  useTextDocumentVersions,
  type TextDocumentVersionItem
} from "../../serverState/useTextDocumentVersions";
import { relativeTime } from "../../utils/formatDateAndTime";
import { notifyMutationError } from "../../utils/notifyMutationError";
import ErrorBanner from "../support/ErrorBanner";
import {
  Caption,
  Chip,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  GAP,
  LoadingSpinner,
  PADDING,
  PanelHeader,
  ScrollArea,
  SelectableListItem,
  Text,
  TextInput
} from "../ui_primitives";

interface DocumentVersionsPanelProps {
  assetId: string;
  /** Saves the open draft, so a version holds what the user sees. */
  flush: () => Promise<void>;
  /** Called before a restore writes the file. */
  onBeforeRestore: () => void;
}

const VersionRow = ({
  version,
  selected,
  onSelect
}: {
  version: TextDocumentVersionItem;
  selected: boolean;
  onSelect: (version: number) => void;
}) => {
  const { t } = useTranslation();
  return (
    <SelectableListItem
      selected={selected}
      onClick={() => onSelect(version.version)}
      aria-pressed={selected}
      sx={{ flexDirection: "column", alignItems: "flex-start" }}
    >
      <FlexRow gap={GAP.tight} align="center">
        <Text size="small" weight={500}>
          {version.name || t("documentEditor.versions.versionNumber", { version: version.version })}
        </Text>
        <Chip compact size="small" label={t(`documentEditor.versions.saveTypes.${version.save_type}`)} />
      </FlexRow>
      <Caption color="secondary">{relativeTime(version.created_at)}</Caption>
    </SelectableListItem>
  );
};

const DocumentVersionsPanel = ({ assetId, flush, onBeforeRestore }: DocumentVersionsPanelProps) => {
  const { t } = useTranslation();
  const { versions, isLoading, error, saveVersion, isSaving, restoreVersion, isRestoring } =
    useTextDocumentVersions(assetId);
  const [selected, setSelected] = useState<number | null>(null);
  const [name, setName] = useState("");
  const preview = useTextDocumentVersionContent(assetId, selected);

  const save = useCallback(async () => {
    try {
      await flush();
      await saveVersion(name);
      setName("");
    } catch (cause) {
      notifyMutationError(t("documentEditor.versions.save"), cause);
    }
  }, [flush, name, saveVersion, t]);

  const restore = useCallback(async () => {
    if (selected === null) return;
    try {
      await flush();
      onBeforeRestore();
      await restoreVersion(selected);
      setSelected(null);
    } catch (cause) {
      notifyMutationError(t("documentEditor.versions.restore"), cause);
    }
  }, [flush, onBeforeRestore, restoreVersion, selected, t]);

  return (
    <FlexColumn fullWidth sx={{ flex: 1, minHeight: 0 }}>
      <PanelHeader title={t("documentEditor.versions.title")} />
      <FlexRow gap={GAP.tight} align="center" sx={{ padding: PADDING.compact }}>
        <TextInput
          compact
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("documentEditor.versions.namePlaceholder")}
          label={t("documentEditor.versions.name")}
          hideLabel
        />
        <EditorButton variant="outlined" density="compact" disabled={isSaving} onClick={() => void save()}>
          {t("documentEditor.versions.save")}
        </EditorButton>
      </FlexRow>
      {error ? (
        <ErrorBanner
          report={{
            source: "operation-failure",
            summary: "Document versions failed to load",
            errorText: String(error)
          }}
        >
          {t("documentEditor.versions.loadError")}
        </ErrorBanner>
      ) : null}
      <ScrollArea thin sx={{ flex: 1, minHeight: 0, paddingX: PADDING.compact }}>
        {isLoading ? (
          <LoadingSpinner size="small" />
        ) : versions.length === 0 ? (
          <EmptyState
            title={t("documentEditor.versions.emptyTitle")}
            description={t("documentEditor.versions.emptyBody")}
          />
        ) : (
          <FlexColumn gap={GAP.tight}>
            {versions.map((version) => (
              <VersionRow
                key={version.version}
                version={version}
                selected={selected === version.version}
                onSelect={setSelected}
              />
            ))}
          </FlexColumn>
        )}
      </ScrollArea>
      {selected !== null && (
        <FlexColumn gap={GAP.normal} sx={{ padding: PADDING.compact, borderTop: 1, borderColor: "divider" }}>
          <ScrollArea thin maxHeight={240}>
            {preview.isLoading ? (
              <LoadingSpinner size="small" />
            ) : (
              <Text size="small" sx={{ whiteSpace: "pre-wrap", fontFamily: "var(--fontFamily2)", overflowWrap: "anywhere" }}>
                {preview.content}
              </Text>
            )}
          </ScrollArea>
          <FlexRow gap={GAP.tight} justify="flex-end">
            <EditorButton variant="text" density="compact" onClick={() => setSelected(null)}>
              {t("common.cancel")}
            </EditorButton>
            <EditorButton variant="contained" density="compact" disabled={isRestoring} onClick={() => void restore()}>
              {t("documentEditor.versions.restore")}
            </EditorButton>
          </FlexRow>
        </FlexColumn>
      )}
    </FlexColumn>
  );
};

export default DocumentVersionsPanel;
