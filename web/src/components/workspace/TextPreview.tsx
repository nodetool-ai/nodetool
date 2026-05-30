/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import type { Asset } from "../../stores/ApiTypes";
import { languageFromAsset, previewKind } from "../../utils/assetLanguage";
import { csvDelimiterFor, parseCsvToDataframe } from "../../utils/csvDataframe";
import MarkdownRenderer from "../../utils/MarkdownRenderer";
import MonacoPane from "./MonacoPane";
import {
  Caption,
  CopyButton,
  DataTable,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  ScrollArea,
  Text
} from "../ui_primitives";

interface TextPreviewProps {
  asset: Asset;
}

const textAssetKey = (id: string) => ["textAsset", id] as const;

/** Cap CSV/TSV rows so a huge file can't lock up the table render. */
const MAX_CSV_ROWS = 2000;

const styles = (theme: Theme) =>
  css({
    width: "100%",
    height: "100%",
    backgroundColor: theme.vars.palette.grey[900],
    ".preview-header": {
      flex: "0 0 auto",
      height: "2.5em",
      padding: "0 0.5em 0 0.75em",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.grey[800]
    },
    ".filename": {
      color: theme.vars.palette.text.primary,
      fontWeight: 500
    },
    ".kind-tag": {
      textTransform: "uppercase",
      letterSpacing: "0.05em"
    },
    ".preview-body": {
      flex: 1,
      minHeight: 0
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
    const allRows = (df.data ?? []) as unknown[][];
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
 * Read-only, content-type-aware preview for a text workspace tab (view mode):
 * markdown → rendered, CSV/TSV → MUI table view, everything else →
 * syntax-highlighted read-only Monaco. Shares the `["textAsset", id]` query
 * with TextDocumentEditor, so toggling view ↔ edit reuses the cached text.
 */
const TextPreview = ({ asset }: TextPreviewProps) => {
  const theme = useTheme();
  const getUrl = asset.get_url ?? undefined;
  const language = useMemo(() => languageFromAsset(asset), [asset]);
  const kind = previewKind(asset);

  const {
    data: text,
    isLoading,
    error
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

  const body = () => {
    if (error) {
      return (
        <FlexColumn className="status">
          <Text size="normal" weight={600} sx={{ color: "error.main" }}>
            Failed to load text content
          </Text>
        </FlexColumn>
      );
    }
    if (isLoading || text === undefined) {
      return (
        <FlexColumn className="status">
          <LoadingSpinner />
        </FlexColumn>
      );
    }
    switch (kind) {
      case "markdown":
        return (
          <ScrollArea
            direction="vertical"
            sx={{ width: "100%", height: "100%" }}
          >
            <MarkdownRenderer content={text} fillContainer />
          </ScrollArea>
        );
      case "csv":
        return <CsvTableView text={text} name={asset.name ?? ""} />;
      default:
        return (
          <MonacoPane
            value={text}
            language={language ?? "plaintext"}
            readOnly
          />
        );
    }
  };

  return (
    <FlexColumn css={styles(theme)} sx={{ width: "100%", height: "100%" }}>
      <FlexRow
        className="preview-header"
        align="center"
        justify="space-between"
        gap={1}
      >
        <FlexRow align="center" gap={1} sx={{ minWidth: 0 }}>
          <Text className="filename" size="small">
            {asset.name}
          </Text>
          <Caption className="kind-tag">
            {kind === "csv" ? "csv" : (language ?? kind)}
          </Caption>
        </FlexRow>
        {text !== undefined && <CopyButton value={text} buttonSize="small" />}
      </FlexRow>
      <div className="preview-body">{body()}</div>
    </FlexColumn>
  );
};

export default TextPreview;
