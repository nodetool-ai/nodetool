/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import type { Asset } from "../../stores/ApiTypes";
import { languageFromAsset, previewKind } from "../../utils/assetLanguage";
import MarkdownRenderer from "../../utils/MarkdownRenderer";
import MonacoPane from "./MonacoPane";
import { CsvTableView } from "./CsvTableView";
import ErrorBanner from "../support/ErrorBanner";
import {
  Caption,
  CopyButton,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  ScrollArea,
  Text, Toolbar, getSpacingPx, SPACING,
  EYEBROW
} from "../ui_primitives";

interface TextPreviewProps {
  asset: Asset;
}

const textAssetKey = (id: string) => ["textAsset", id] as const;

const styles = (theme: Theme) =>
  css({
    width: "100%",
    height: "100%",
    backgroundColor: theme.vars.palette.background.default,
    ".filename": {
      color: theme.vars.palette.text.primary,
      fontWeight: 500
    },
    ".kind-tag": {
      ...EYEBROW,
    },
    ".preview-body": {
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
 * Read-only, content-type-aware preview for a text workspace tab (view mode):
 * markdown → rendered, CSV/TSV → MUI table view, everything else →
 * syntax-highlighted read-only Monaco. Shares the `["textAsset", id]` query
 * with TextDocumentEditor, so toggling view ↔ edit reuses the cached text.
 */
const TextPreview = ({ asset }: TextPreviewProps) => {
  const { t } = useTranslation();
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
          <ErrorBanner
            report={{
              source: "operation-failure",
              summary: "Text preview failed to load",
              errorText: error.message
            }}
          >
              {t("i18n-next51.text.loadError")}
          </ErrorBanner>
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
      <Toolbar
        className="preview-header"
        sx={{ justifyContent: "space-between", pl: SPACING.lg }}
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
      </Toolbar>
      <div className="preview-body">{body()}</div>
    </FlexColumn>
  );
};

export default TextPreview;
