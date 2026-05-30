/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import WrapTextIcon from "@mui/icons-material/WrapText";
import SaveIcon from "@mui/icons-material/Save";

import type { Asset, DataframeRef } from "../../stores/ApiTypes";
import { useAssetStore } from "../../stores/AssetStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { languageFromAsset, previewKind } from "../../utils/assetLanguage";
import {
  csvDelimiterFor,
  dataframeToCsv,
  parseCsvToDataframe
} from "../../utils/csvDataframe";
import MonacoPane from "./MonacoPane";
import DataTable from "../node/DataTable/DataTable";
import {
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  ToolbarIconButton,
  TruncatedText
} from "../ui_primitives";

interface TextDocumentEditorProps {
  asset: Asset;
}

const textAssetKey = (id: string) => ["textAsset", id] as const;

const styles = (theme: Theme) =>
  css({
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    backgroundColor: theme.vars.palette.grey[900],
    ".editor-toolbar": {
      flex: "0 0 auto",
      height: "2.5em",
      padding: "0 0.5em 0 0.75em",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.grey[800]
    },
    ".filename": {
      color: theme.vars.palette.text.primary,
      fontWeight: 500,
      maxWidth: "40ch"
    },
    ".language-tag": {
      textTransform: "uppercase",
      letterSpacing: "0.05em"
    },
    ".dirty-dot": {
      width: 8,
      height: 8,
      borderRadius: "50%",
      backgroundColor: theme.vars.palette.warning.main,
      flex: "0 0 auto"
    },
    ".editor-host": {
      flex: 1,
      minHeight: 0,
      position: "relative"
    },
    ".table-host": {
      flex: 1,
      minHeight: 0,
      overflow: "auto",
      padding: "0.75em"
    }
  });

/**
 * The edit surface of a `text` workspace tab. CSV/TSV assets open in the
 * tabular DataTable editor; every other text format opens in Monaco with a
 * filename-inferred language. Edits are tracked against the loaded baseline
 * (dirty dot) and persisted back via the asset update API (Cmd/Ctrl+S or the
 * toolbar Save button).
 */
const TextDocumentEditor = ({ asset }: TextDocumentEditorProps) => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const update = useAssetStore((state) => state.update);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const language = useMemo(() => languageFromAsset(asset), [asset]);
  const kind = previewKind(asset);
  const isCsv = kind === "csv";
  const getUrl = asset.get_url ?? undefined;

  const [content, setContent] = useState<string | null>(null);
  const [savedContent, setSavedContent] = useState<string | null>(null);
  const [wordWrap, setWordWrap] = useState(true);

  const {
    data: loadedText,
    isLoading: textLoading,
    error: textError
  } = useQuery({
    queryKey: textAssetKey(asset.id),
    enabled: !!getUrl,
    queryFn: async () => {
      if (!getUrl) {
        throw new Error("Text asset has no download URL");
      }
      const response = await fetch(getUrl);
      if (!response.ok) {
        throw new Error(`Failed to load text asset: ${response.status}`);
      }
      return response.text();
    }
  });

  // Seed the editor once the text arrives; the query cache stays the source of
  // truth so re-opening the tab restores the last-saved content.
  useEffect(() => {
    if (loadedText !== undefined && content === null) {
      setContent(loadedText);
      setSavedContent(loadedText);
    }
  }, [loadedText, content]);

  const saveMutation = useMutation({
    mutationFn: (text: string) =>
      update({
        id: asset.id,
        data: text,
        content_type: asset.content_type ?? "text/plain"
      }),
    onSuccess: (_asset, text) => {
      setSavedContent(text);
      queryClient.setQueryData(textAssetKey(asset.id), text);
      addNotification({
        type: "success",
        alert: true,
        content: `Saved ${asset.name}`,
        dismissable: false
      });
    },
    onError: (error) => {
      addNotification({
        type: "error",
        alert: true,
        content: `Failed to save ${asset.name}: ${(error as Error).message}`,
        dismissable: false
      });
    }
  });

  const isDirty = content !== null && content !== savedContent;
  const isSaving = saveMutation.isPending;

  const handleSave = useCallback(() => {
    if (content === null || content === savedContent || isSaving) {
      return;
    }
    saveMutation.mutate(content);
  }, [content, savedContent, isSaving, saveMutation]);

  // CSV editing round-trips through a DataframeRef: the text stays canonical
  // for dirty-tracking and saving, the table just edits a parsed view of it.
  const delimiter = useMemo(
    () => csvDelimiterFor(asset.name ?? ""),
    [asset.name]
  );
  const dataframe = useMemo<DataframeRef | null>(
    () => (isCsv && content !== null ? parseCsvToDataframe(content, delimiter) : null),
    [isCsv, content, delimiter]
  );

  const handleDataframeChange = useCallback(
    (df: DataframeRef) => setContent(dataframeToCsv(df, delimiter)),
    [delimiter]
  );

  const body = () => {
    if (textError) {
      return (
        <FlexColumn
          fullWidth
          fullHeight
          sx={{ alignItems: "center", justifyContent: "center" }}
        >
          <Caption sx={{ color: "error.main" }}>
            Failed to load text content
          </Caption>
        </FlexColumn>
      );
    }
    if (textLoading || content === null) {
      return (
        <FlexColumn
          fullWidth
          fullHeight
          sx={{ alignItems: "center", justifyContent: "center" }}
        >
          <LoadingSpinner />
        </FlexColumn>
      );
    }
    if (isCsv && dataframe) {
      return (
        <div className="table-host">
          <DataTable
            dataframe={dataframe}
            editable
            isModalMode
            onChange={handleDataframeChange}
          />
        </div>
      );
    }
    return (
      <div className="editor-host">
        <MonacoPane
          value={content}
          language={language ?? "plaintext"}
          wordWrap={wordWrap}
          onChange={setContent}
          onSave={handleSave}
        />
      </div>
    );
  };

  return (
    <div css={styles(theme)}>
      <FlexRow
        className="editor-toolbar"
        align="center"
        justify="space-between"
        gap={1}
      >
        <FlexRow align="center" gap={1} sx={{ minWidth: 0 }}>
          {isDirty && (
            <span className="dirty-dot" aria-label="Unsaved changes" />
          )}
          <TruncatedText className="filename" showTooltip>
            {asset.name}
          </TruncatedText>
          {language && <Caption className="language-tag">{language}</Caption>}
        </FlexRow>
        <FlexRow align="center" gap={0.5}>
          {!isCsv && (
            <ToolbarIconButton
              tooltip={wordWrap ? "Disable word wrap" : "Enable word wrap"}
              icon={<WrapTextIcon />}
              onClick={() => setWordWrap((w) => !w)}
              active={wordWrap}
              size="small"
            />
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

      {body()}
    </div>
  );
};

export default TextDocumentEditor;
