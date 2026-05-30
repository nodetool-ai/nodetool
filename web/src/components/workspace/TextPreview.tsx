/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import Papa from "papaparse";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism";
import {
  oneDark,
  oneLight
} from "react-syntax-highlighter/dist/esm/styles/prism";

import type { Asset } from "../../stores/ApiTypes";
import { languageFromAsset } from "../../utils/assetLanguage";
import { useIsDarkMode } from "../../hooks/useIsDarkMode";
import MarkdownRenderer from "../../utils/MarkdownRenderer";
import {
  Caption,
  CopyButton,
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
const MAX_CSV_ROWS = 1000;

/** Monaco language id → Prism language id (most match; map the divergent ones). */
const PRISM_LANGUAGE: Record<string, string> = {
  shell: "bash",
  plaintext: "text"
};

type PreviewKind = "markdown" | "csv" | "code" | "text";

const previewKind = (asset: Asset, language: string | undefined): PreviewKind => {
  const name = (asset.name ?? "").toLowerCase();
  if (language === "markdown") return "markdown";
  if (name.endsWith(".csv") || name.endsWith(".tsv")) return "csv";
  if (language && language !== "plaintext") return "code";
  return "text";
};

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
    ".plain-text": {
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      padding: "1em 1.25em",
      color: theme.vars.palette.text.primary
    },
    ".csv-table": {
      borderCollapse: "collapse",
      fontSize: theme.fontSizeSmall,
      fontFamily: theme.fontFamily2,
      "th, td": {
        border: `1px solid ${theme.vars.palette.divider}`,
        padding: "0.25em 0.6em",
        textAlign: "left",
        whiteSpace: "nowrap"
      },
      th: {
        position: "sticky",
        top: 0,
        backgroundColor: theme.vars.palette.grey[800],
        color: theme.vars.palette.text.primary
      }
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

const CsvPreview = ({ text }: { text: string }) => {
  const { rows, truncated } = useMemo(() => {
    const parsed = Papa.parse<string[]>(text.trim(), {
      skipEmptyLines: true
    });
    const all = parsed.data ?? [];
    return {
      rows: all.slice(0, MAX_CSV_ROWS),
      truncated: all.length > MAX_CSV_ROWS
    };
  }, [text]);

  if (rows.length === 0) {
    return <div className="plain-text">{text}</div>;
  }

  const [header, ...body] = rows;
  return (
    <ScrollArea direction="both" sx={{ width: "100%", height: "100%" }}>
      <table className="csv-table">
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th key={i}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {truncated && (
        <Caption className="csv-note">
          Showing first {MAX_CSV_ROWS} rows.
        </Caption>
      )}
    </ScrollArea>
  );
};

const CodePreview = ({
  text,
  language
}: {
  text: string;
  language: string;
}) => {
  const isDark = useIsDarkMode();
  const prismLanguage = PRISM_LANGUAGE[language] ?? language;
  return (
    <ScrollArea direction="both" sx={{ width: "100%", height: "100%" }}>
      <SyntaxHighlighter
        language={prismLanguage}
        style={isDark ? oneDark : oneLight}
        showLineNumbers
        wrapLongLines={false}
        customStyle={{
          margin: 0,
          padding: "1em 1.25em",
          background: "transparent",
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: "var(--fontSizeSmall)"
        }}
      >
        {text}
      </SyntaxHighlighter>
    </ScrollArea>
  );
};

/**
 * Read-only, content-type-aware preview for a text workspace tab (view mode).
 * Routes by file type: markdown → rendered, code/JSON/YAML → syntax-highlighted,
 * CSV/TSV → table, everything else → plain wrapped text. It shares the
 * `["textAsset", id]` query with TextDocumentEditor, so toggling view ↔ edit
 * reuses the cached text instead of re-fetching.
 */
const TextPreview = ({ asset }: TextPreviewProps) => {
  const theme = useTheme();
  const getUrl = asset.get_url ?? undefined;
  const language = useMemo(() => languageFromAsset(asset), [asset]);
  const kind = previewKind(asset, language);

  const { data: text, isLoading, error } = useQuery({
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
          <ScrollArea direction="vertical" sx={{ width: "100%", height: "100%" }}>
            <MarkdownRenderer content={text} fillContainer />
          </ScrollArea>
        );
      case "csv":
        return <CsvPreview text={text} />;
      case "code":
        return <CodePreview text={text} language={language ?? "text"} />;
      default:
        return (
          <ScrollArea direction="vertical" sx={{ width: "100%", height: "100%" }}>
            <div className="plain-text">{text}</div>
          </ScrollArea>
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
