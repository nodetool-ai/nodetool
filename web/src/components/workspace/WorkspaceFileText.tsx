/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

import { trpcClient } from "../../trpc/client";
import { useNotificationStore } from "../../stores/NotificationStore";
import { languageFromAsset } from "../../utils/assetLanguage";
import MarkdownRenderer from "../../utils/MarkdownRenderer";
import MonacoPane from "./MonacoPane";
import { CsvTableView } from "./CsvTableView";
import { workspaceFileName } from "./workspaceFileRef";
import type { WorkspaceFileKind } from "./workspaceFileKind";
import type { WorkspaceTabMode } from "../../stores/WorkspaceTabsStore";
import ErrorBanner from "../support/ErrorBanner";
import { useClipboard } from "../../hooks/browser/useClipboard";
import {
  AlertBanner,
  DocumentBar,
  FlexColumn,
  LoadingSpinner,
  MenuItemPrimitive,
  ScrollArea,
  getSpacingPx,
  SPACING,
  SaveStatus,
  UndoRedoButtons
} from "../ui_primitives";
import type { DocumentBarRender } from "../ui_primitives";
import {
  DocumentMoreMenu,
  DocumentSaveButton,
  explicitSaveStatus,
  useMonacoHistory
} from "./documentBarParts";

interface WorkspaceFileTextProps {
  workspaceId: string;
  path: string;
  kind: WorkspaceFileKind;
  mode: WorkspaceTabMode;
  /** Draws the document bar. Defaults to a bar titled with the file name. */
  documentBar?: DocumentBarRender;
}

const workspaceFileTextKey = (workspaceId: string, path: string) =>
  ["workspaceFile", workspaceId, path] as const;

const styles = (theme: Theme) =>
  css({
    width: "100%",
    height: "100%",
    backgroundColor: theme.vars.palette.background.default,
    ".file-body": {
      flex: 1,
      minHeight: 0
    },
    ".csv-note": {
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xl)}`
    },
    ".status": {
      width: "100%",
      height: "100%",
      alignItems: "center",
      justifyContent: "center"
    }
  });

/**
 * The text half of a `workspace-file` tab: reads the file through
 * `workspace.readFile`, renders it per kind in view mode (markdown rendered,
 * CSV/TSV as a table, everything else in read-only Monaco) and edits it in
 * Monaco in edit mode, saving through `workspace.writeFile` on Cmd/Ctrl+S or
 * the document bar's Save. Copy sits in the bar's ⋮ menu.
 *
 * A file the backend truncated is read-only: saving would write the prefix
 * back over the whole file.
 */
const WorkspaceFileText = ({
  workspaceId,
  path,
  kind,
  mode,
  documentBar
}: WorkspaceFileTextProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const paneStyles = useMemo(() => styles(theme), [theme]);
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const { writeClipboard } = useClipboard();
  const history = useMonacoHistory();
  const name = workspaceFileName(path);
  const language = useMemo(
    () => languageFromAsset({ name }) ?? "plaintext",
    [name]
  );

  const queryKey = workspaceFileTextKey(workspaceId, path);
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () =>
      trpcClient.workspace.readFile.query({ id: workspaceId, path })
  });

  const loadedText = data?.content;
  const truncated = data?.truncated ?? false;

  const [content, setContent] = useState<string | null>(null);
  const [savedContent, setSavedContent] = useState<string | null>(null);

  useEffect(() => {
    if (loadedText === undefined) {
      return;
    }
    setContent((current) => (current === null ? loadedText : current));
    setSavedContent((current) => (current === null ? loadedText : current));
  }, [loadedText]);

  // Re-derive when the tab is pointed at a different file. Guarded by a ref so
  // it cannot run in the same flush as the seed above and blank a cache hit.
  const previousFile = useRef(`${workspaceId}::${path}`);
  useEffect(() => {
    const current = `${workspaceId}::${path}`;
    if (previousFile.current === current) {
      return;
    }
    previousFile.current = current;
    setContent(null);
    setSavedContent(null);
  }, [workspaceId, path]);

  const saveMutation = useMutation({
    mutationFn: (text: string) =>
      trpcClient.workspace.writeFile.mutate({
        id: workspaceId,
        path,
        content: text
      }),
    onSuccess: (_entry, text) => {
      setSavedContent(text);
      queryClient.setQueryData(queryKey, (previous) =>
        previous ? { ...previous, content: text } : previous
      );
      addNotification({
        type: "success",
        alert: true,
        content: `Saved ${name}`,
        dismissable: false
      });
    },
    onError: (saveError: Error) => {
      addNotification({
        type: "error",
        alert: true,
        content: `Failed to save ${name}: ${saveError.message}`,
        dismissable: false
      });
    }
  });

  const isSaving = saveMutation.isPending;
  const isDirty = content !== null && content !== savedContent;
  const canSave = isDirty && !isSaving && !truncated;

  const handleSave = useCallback(() => {
    if (content === null || content === savedContent || isSaving || truncated) {
      return;
    }
    saveMutation.mutate(content);
  }, [content, savedContent, isSaving, truncated, saveMutation]);

  const body = () => {
    if (error) {
      return (
        <FlexColumn className="status">
          <ErrorBanner
            report={{
              source: "operation-failure",
              summary: "Workspace file failed to load",
              errorText: error.message
            }}
          >
            {t("i18n-next51.workspaceFile.loadError", { name })}
          </ErrorBanner>
        </FlexColumn>
      );
    }
    if (isLoading || content === null) {
      return (
        <FlexColumn className="status">
          <LoadingSpinner />
        </FlexColumn>
      );
    }

    if (mode === "edit") {
      return (
        <MonacoPane
          value={content}
          language={language}
          readOnly={truncated}
          onChange={setContent}
          onSave={handleSave}
          onEditorMount={history.onEditorMount}
        />
      );
    }

    switch (kind) {
      case "markdown":
        return (
          <ScrollArea
            direction="vertical"
            sx={{ width: "100%", height: "100%" }}
          >
            <MarkdownRenderer content={content} fillContainer />
          </ScrollArea>
        );
      case "csv":
        return <CsvTableView text={content} name={name} />;
      default:
        return <MonacoPane value={content} language={language} readOnly />;
    }
  };

  const editing = mode === "edit";
  const barSlots = {
    status: !editing ? undefined : truncated ? (
      <SaveStatus state="readOnly" />
    ) : (
      <SaveStatus
        state={explicitSaveStatus({
          saving: isSaving,
          dirty: isDirty,
          failed: saveMutation.isError
        })}
        onRetry={handleSave}
      />
    ),
    history:
      editing && !truncated ? (
        <UndoRedoButtons
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onUndo={history.undo}
          onRedo={history.redo}
        />
      ) : undefined,
    actions: (
      <>
        {editing && !truncated && (
          <DocumentSaveButton
            onSave={handleSave}
            saving={isSaving}
            disabled={!canSave}
          />
        )}
        <DocumentMoreMenu
          items={(close) => [
            <MenuItemPrimitive
              key="copy"
              icon={<ContentCopyIcon fontSize="small" />}
              label={t("i18n-next103.documentBar.copyContents")}
              disabled={content === null}
              onClick={() => {
                close();
                if (content !== null) void writeClipboard(content, true);
              }}
            />
          ]}
        />
      </>
    )
  };

  return (
    <FlexColumn css={paneStyles} sx={{ width: "100%", height: "100%" }}>
      {documentBar ? (
        documentBar(barSlots)
      ) : (
        <DocumentBar title={name} {...barSlots} />
      )}
      {truncated && (
        <AlertBanner severity="warning" compact>
          Showing the first part of this file only — it is too large to load in
          full, so editing is disabled.
        </AlertBanner>
      )}
      <div className="file-body">{body()}</div>
    </FlexColumn>
  );
};

export default WorkspaceFileText;
