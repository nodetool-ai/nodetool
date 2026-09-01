/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import SaveIcon from "@mui/icons-material/Save";

import { trpcClient } from "../../trpc/client";
import { useNotificationStore } from "../../stores/NotificationStore";
import { languageFromAsset } from "../../utils/assetLanguage";
import { csvDelimiterFor, parseCsvToDataframe } from "../../utils/csvDataframe";
import MarkdownRenderer from "../../utils/MarkdownRenderer";
import MonacoPane from "./MonacoPane";
import { workspaceFileName } from "./workspaceFileRef";
import type { WorkspaceFileKind } from "./workspaceFileKind";
import type { WorkspaceTabMode } from "../../stores/WorkspaceTabsStore";
import {
  AlertBanner,
  BORDER_RADIUS,
  Caption,
  CopyButton,
  DataTable,
  EditorButton,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  ScrollArea,
  Text
} from "../ui_primitives";

interface WorkspaceFileTextProps {
  workspaceId: string;
  path: string;
  kind: WorkspaceFileKind;
  mode: WorkspaceTabMode;
}

/** Cap CSV/TSV rows so a huge file can't lock up the table render. */
const MAX_CSV_ROWS = 2000;

const workspaceFileTextKey = (workspaceId: string, path: string) =>
  ["workspaceFile", workspaceId, path] as const;

const styles = (theme: Theme) =>
  css({
    width: "100%",
    height: "100%",
    backgroundColor: theme.vars.palette.background.default,
    ".file-header": {
      flex: "0 0 auto",
      height: "2.5em",
      padding: "0 0.5em 0 0.75em",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.paper
    },
    ".filename": {
      color: theme.vars.palette.text.primary,
      fontWeight: 500
    },
    ".kind-tag": {
      textTransform: "uppercase",
      letterSpacing: "0.05em"
    },
    ".file-body": {
      flex: 1,
      minHeight: 0
    },
    ".dirty-dot": {
      width: 8,
      height: 8,
      borderRadius: BORDER_RADIUS.circle,
      backgroundColor: theme.vars.palette.warning.main,
      flex: "0 0 auto"
    },
    ".csv-note": {
      padding: "0.5em 1.25em"
    },
    ".status": {
      width: "100%",
      height: "100%",
      alignItems: "center",
      justifyContent: "center"
    }
  });

const CsvTableView = ({ text, name }: { text: string; name: string }) => {
  const { columns, rows, truncated } = useMemo(() => {
    const df = parseCsvToDataframe(text, csvDelimiterFor(name));
    const cols = (df.columns ?? []).map((c, i) => ({
      key: String(i),
      label: c.name
    }));
    const allRows = df.data ?? [];
    const mapped = allRows
      .slice(0, MAX_CSV_ROWS)
      .map((row) =>
        Object.fromEntries(
          row.map((cell, i) => [String(i), cell as React.ReactNode])
        )
      );
    return {
      columns: cols,
      rows: mapped,
      truncated: allRows.length > MAX_CSV_ROWS
    };
  }, [text, name]);

  if (columns.length === 0) {
    return (
      <FlexColumn className="status">
        <Caption>Empty table</Caption>
      </FlexColumn>
    );
  }

  return (
    <ScrollArea direction="both" sx={{ width: "100%", height: "100%" }}>
      <DataTable columns={columns} rows={rows} compact bordered stickyHeader />
      {truncated && (
        <Caption className="csv-note">
          Showing first {MAX_CSV_ROWS} rows.
        </Caption>
      )}
    </ScrollArea>
  );
};

/**
 * The text half of a `workspace-file` tab: reads the file through
 * `workspace.readFile`, renders it per kind in view mode (markdown rendered,
 * CSV/TSV as a table, everything else in read-only Monaco) and edits it in
 * Monaco in edit mode, saving through `workspace.writeFile` on Cmd/Ctrl+S or
 * the toolbar button.
 *
 * A file the backend truncated is read-only: saving would write the prefix
 * back over the whole file.
 */
const WorkspaceFileText = ({
  workspaceId,
  path,
  kind,
  mode
}: WorkspaceFileTextProps) => {
  const theme = useTheme();
  const paneStyles = useMemo(() => styles(theme), [theme]);
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const name = workspaceFileName(path);
  const language = useMemo(
    () => languageFromAsset({ name }) ?? "plaintext",
    [name]
  );

  const queryKey = workspaceFileTextKey(workspaceId, path);
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => trpcClient.workspace.readFile.query({ id: workspaceId, path })
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
          <Text size="normal" weight={600} sx={{ color: "error.main" }}>
            Failed to load {name}
          </Text>
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

  return (
    <FlexColumn css={paneStyles} sx={{ width: "100%", height: "100%" }}>
      <FlexRow
        className="file-header"
        align="center"
        justify="space-between"
        gap={1}
      >
        <FlexRow align="center" gap={1} sx={{ minWidth: 0 }}>
          <Text className="filename" size="small">
            {name}
          </Text>
          <Caption className="kind-tag">{kind}</Caption>
        </FlexRow>
        <FlexRow align="center" gap={0.5}>
          {content !== null && (
            <CopyButton value={content} buttonSize="small" />
          )}
          {mode === "edit" && (
            <>
              {isDirty && (
                <span className="dirty-dot" aria-label="Unsaved changes" />
              )}
              <EditorButton
                variant="contained"
                size="small"
                startIcon={<SaveIcon />}
                disabled={!canSave}
                onClick={handleSave}
              >
                {isSaving ? "Saving…" : "Save"}
              </EditorButton>
            </>
          )}
        </FlexRow>
      </FlexRow>
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
