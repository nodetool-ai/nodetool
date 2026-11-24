/** @jsxImportSource @emotion/react */
/**
 * Renders a `document` value directly inside a workflow node (`OutputRenderer`)
 * with pinned document commands and independent scrolling (`nodrag nopan nowheel`)
 * so reading, selecting text, and scrolling never drag or zoom the canvas.
 */
import { css } from "@emotion/react";
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type WheelEvent
} from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useTheme, type Theme } from "@mui/material/styles";
import { useInRouterContext, useLocation, useNavigate } from "react-router-dom";
import ReactMarkdown, { defaultUrlTransform, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import CodeOutlinedIcon from "@mui/icons-material/CodeOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";

import type { Document } from "../../../stores/ApiTypes";
import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore
} from "../../../stores/WorkspaceTabsStore";
import { useAsset } from "../../../serverState/useAsset";
import {
  useTextDocumentExport,
  type DocumentExportFormat
} from "../../../serverState/useTextDocumentTransfer";
import { assetIdOf } from "../../../utils/mediaRef";
import { isSpreadsheetAsset, isTextAsset } from "../../../utils/assetLanguage";
import isEqual from "../../../utils/isEqual";
import { isString } from "../../../utils/typePredicates";
import {
  BORDER_RADIUS,
  Box,
  CopyButton,
  Dialog,
  EditorMenu,
  EmptyState,
  FlexRow,
  FONT_SIZE_MONO,
  FONT_SIZE_SANS,
  FONT_WEIGHT,
  GAP,
  LoadingSpinner,
  MenuItemPrimitive,
  SPACING,
  ToolbarIconButton,
  TruncatedText,
  TYPOGRAPHY,
  getSpacingPx,
  scrollbarStyles
} from "../../ui_primitives";
import { getMimeTypeFromUri, useSignedUrl } from "./hooks";
import { documentBytes, isPdfBytes } from "../outputRendererModel";
import { isStoredUri } from "../outputValueResolvers";
import { JSONRenderer } from "./JSONRenderer";
import DocumentEmbed from "../../documentEditor/nodes/DocumentEmbed";
import {
  DocumentLocationProvider,
  type DocumentLocation
} from "../../documentEditor/documentEditorContext";
import "../../../styles/markdown/github-markdown.css";
import "../../../styles/markdown/nodetool-markdown.css";

const REMARK_PLUGINS: Options["remarkPlugins"] = [remarkGfm];
const SCROLL_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " "
]);
const SAFE_LINK_SCHEME = /^(https?:|mailto:)/i;
/** Embed locators a document may hold; ReactMarkdown would blank them. */
const EMBED_SCHEME = /^(asset|storyboard):\/\//i;
const markdownUrlTransform = (url: string): string =>
  EMBED_SCHEME.test(url) ? url : defaultUrlTransform(url);
const SNIFF_BYTES = 4096;

/** Query key shared with DocumentEditor, TextPreview, and resourceChangeHandler. */
const textAssetKey = (id: string) => ["textAsset", id] as const;

const noopFlush = async (): Promise<void> => {};

const looksBinary = (bytes: Uint8Array): boolean => {
  if (isPdfBytes(bytes)) {
    return true;
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  ) {
    return true;
  }
  const end = Math.min(bytes.length, SNIFF_BYTES);
  for (let index = 0; index < end; index += 1) {
    if (bytes[index] === 0) {
      return true;
    }
  }
  return false;
};

const documentFileName = (uri: string): string => {
  if (!uri || uri.startsWith("data:") || uri.startsWith("memory://")) {
    return "";
  }
  const clean = uri.split(/[?#]/)[0] ?? "";
  const segment = clean.slice(clean.lastIndexOf("/") + 1);
  if (!segment || (uri.startsWith("asset://") && !segment.includes("."))) {
    return "";
  }
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

const downloadFileName = (title: string, extension: string): string => {
  const trimmed = title.trim() || "document";
  const hasExt = /\.[a-z0-9]{1,8}$/i.test(trimmed);
  return hasExt ? trimmed : `${trimmed}.${extension}`;
};

const triggerBlobDownload = (
  content: string,
  filename: string,
  mimeType: string
): void => {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

const triggerUrlDownload = (url: string, filename: string): void => {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
};

const stopPointer = (event: PointerEvent | MouseEvent): void => {
  event.stopPropagation();
};

const stopWheel = (event: WheelEvent): void => {
  event.stopPropagation();
};

const stopScrollKeys = (event: KeyboardEvent): void => {
  if (SCROLL_KEYS.has(event.key)) {
    event.stopPropagation();
  }
};

const sp = getSpacingPx;

const documentRendererStyles = (theme: Theme) =>
  css({
    "&.doc-output-renderer": {
      width: "100%",
      height: "100%",
      minHeight: 0,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      borderRadius: BORDER_RADIUS.sm,
      border: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.paper
    },
    ".doc-output-header": {
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: sp(SPACING.sm),
      padding: `${sp(SPACING.xs)} ${sp(SPACING.sm)}`,
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.default
    },
    ".doc-output-title-group": {
      display: "flex",
      alignItems: "center",
      gap: sp(SPACING.xs),
      minWidth: 0,
      flex: 1,
      color: theme.vars.palette.text.secondary
    },
    ".doc-output-title": {
      ...TYPOGRAPHY.sans.caption,
      fontWeight: FONT_WEIGHT.medium,
      color: theme.vars.palette.text.primary
    },
    ".doc-output-actions": {
      display: "flex",
      alignItems: "center",
      gap: sp(SPACING.micro),
      flexShrink: 0
    },
    ".doc-output-scroll": {
      flex: "1 1 auto",
      minHeight: 0,
      overflowY: "auto",
      overflowX: "hidden",
      overscrollBehavior: "contain",
      userSelect: "text",
      cursor: "text",
      outline: "none",
      ...scrollbarStyles(theme),
      "&:focus-visible": {
        boxShadow: `inset 0 0 0 1px ${theme.vars.palette.primary.main}`
      }
    },
    ".doc-output-center": {
      height: "100%",
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: sp(SPACING.lg)
    },
    ".doc-output-pdf": {
      flex: "1 1 auto",
      minHeight: 0,
      width: "100%",
      border: "none",
      backgroundColor: theme.vars.palette.background.default
    },
    ".doc-output-source": {
      margin: 0,
      padding: sp(SPACING.md),
      ...TYPOGRAPHY.mono.code,
      fontSize: FONT_SIZE_MONO.code,
      lineHeight: 1.5,
      color: theme.vars.palette.text.primary,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word"
    },
    ".doc-output-markdown": {
      padding: `${sp(SPACING.md)} ${sp(SPACING.lg)} ${sp(SPACING.xl)}`,
      color: theme.vars.palette.text.primary,
      ...TYPOGRAPHY.sans.body,
      fontSize: FONT_SIZE_SANS.body,
      lineHeight: 1.55,
      backgroundColor: "transparent",
      "& > *:first-of-type": {
        marginTop: 0
      },
      "& > *:last-child": {
        marginBottom: 0
      },
      "h1, h2, h3, h4, h5, h6": {
        color: theme.vars.palette.text.primary,
        fontWeight: FONT_WEIGHT.semibold,
        lineHeight: 1.3,
        margin: `${sp(SPACING.lg)} 0 ${sp(SPACING.sm)}`,
        borderBottom: "none",
        paddingBottom: 0
      },
      h1: { fontSize: `calc(${FONT_SIZE_SANS.title} * 1.2)` },
      h2: { fontSize: FONT_SIZE_SANS.title },
      h3: { fontSize: `calc(${FONT_SIZE_SANS.body} * 1.05)` },
      "h4, h5, h6": { fontSize: FONT_SIZE_SANS.body },
      p: {
        margin: `0 0 ${sp(SPACING.md)}`,
        overflowWrap: "anywhere"
      },
      "ul, ol": {
        margin: `0 0 ${sp(SPACING.md)}`,
        paddingLeft: sp(SPACING.xl)
      },
      li: {
        margin: `${sp(SPACING.micro)} 0`
      },
      blockquote: {
        margin: `0 0 ${sp(SPACING.md)}`,
        padding: `0 0 0 ${sp(SPACING.md)}`,
        borderLeft: `2px solid ${theme.vars.palette.divider}`,
        color: theme.vars.palette.text.secondary
      },
      code: {
        ...TYPOGRAPHY.mono.code,
        fontSize: FONT_SIZE_MONO.code,
        backgroundColor: theme.vars.palette.action.selected,
        padding: `${sp(SPACING.micro)} ${sp(SPACING.xs)}`,
        borderRadius: BORDER_RADIUS.xs
      },
      pre: {
        margin: `0 0 ${sp(SPACING.md)}`,
        padding: sp(SPACING.md),
        borderRadius: BORDER_RADIUS.sm,
        backgroundColor: theme.vars.palette.background.default,
        overflowX: "auto",
        code: {
          backgroundColor: "transparent",
          padding: 0
        }
      },
      table: {
        borderCollapse: "collapse",
        margin: `0 0 ${sp(SPACING.md)}`,
        width: "100%"
      },
      "th, td": {
        border: `1px solid ${theme.vars.palette.divider}`,
        padding: `${sp(SPACING.xs)} ${sp(SPACING.sm)}`,
        textAlign: "left"
      },
      th: {
        fontWeight: FONT_WEIGHT.semibold,
        backgroundColor: theme.vars.palette.action.hover
      },
      hr: {
        border: "none",
        borderTop: `1px solid ${theme.vars.palette.divider}`,
        margin: `${sp(SPACING.lg)} 0`
      },
      a: {
        color: theme.vars.palette.c_link,
        textDecoration: "underline"
      }
    }
  });

const fullscreenBodyStyles = (theme: Theme) =>
  css({
    width: "100%",
    height: "100%",
    overflowY: "auto",
    overflowX: "hidden",
    userSelect: "text",
    cursor: "text",
    ...scrollbarStyles(theme),
    ".doc-output-fullscreen-inner": {
      maxWidth: "48rem",
      margin: "0 auto",
      padding: `${sp(SPACING.xl)} ${sp(SPACING.xxl)} ${sp(SPACING.xxxl)}`
    }
  });

const MarkdownContent = memo(function MarkdownContent({
  content,
  location
}: {
  content: string;
  location: DocumentLocation;
}) {
  const components: Options["components"] = useMemo(
    () => ({
      a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
        if (href && SAFE_LINK_SCHEME.test(href)) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          );
        }
        return <span>{children}</span>;
      },
      img: ({ src, alt }: { src?: string | Blob; alt?: string }) =>
        typeof src === "string" && src !== "" ? (
          <DocumentEmbed src={src} alt={alt ?? ""} />
        ) : null
    }),
    []
  );

  return (
    <DocumentLocationProvider value={location}>
      <div className="doc-output-markdown markdown-body">
        <ReactMarkdown
          remarkPlugins={REMARK_PLUGINS}
          components={components}
          urlTransform={markdownUrlTransform}
        >
          {content}
        </ReactMarkdown>
      </div>
    </DocumentLocationProvider>
  );
});

interface OpenDocumentActionProps {
  onOpen: () => void;
  tooltip: string;
}

const RouterOpenDocumentButton = ({
  onOpen,
  tooltip
}: OpenDocumentActionProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  const handleClick = useCallback(() => {
    onOpen();
    if (!location.pathname.startsWith("/workspace")) {
      navigate("/workspace");
    }
  }, [location.pathname, navigate, onOpen]);

  return (
    <ToolbarIconButton
      icon={<OpenInNewIcon fontSize="small" />}
      tooltip={tooltip}
      ariaLabel={tooltip}
      size="small"
      onClick={handleClick}
    />
  );
};

const OpenDocumentButton = (props: OpenDocumentActionProps) => {
  const inRouter = useInRouterContext();
  if (inRouter) {
    return <RouterOpenDocumentButton {...props} />;
  }
  return (
    <ToolbarIconButton
      icon={<OpenInNewIcon fontSize="small" />}
      tooltip={props.tooltip}
      ariaLabel={props.tooltip}
      size="small"
      onClick={props.onOpen}
    />
  );
};

interface DocumentExportActionProps {
  assetId: string;
  onDownloadMarkdown: () => void;
  canDownloadMarkdown: boolean;
}

const DocumentExportAction = ({
  assetId,
  onDownloadMarkdown,
  canDownloadMarkdown
}: DocumentExportActionProps) => {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const { exportDocument, exporting } = useTextDocumentExport(assetId, noopFlush);

  const handleOpenMenu = useCallback((event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setAnchor(event.currentTarget);
  }, []);

  const handleCloseMenu = useCallback(() => {
    setAnchor(null);
  }, []);

  const handleExport = useCallback(
    (format: DocumentExportFormat) => {
      setAnchor(null);
      void exportDocument(format);
    },
    [exportDocument]
  );

  const handleDownload = useCallback(() => {
    setAnchor(null);
    onDownloadMarkdown();
  }, [onDownloadMarkdown]);

  const label = t("documentEditor.export.label", "Export or download");

  return (
    <>
      <ToolbarIconButton
        icon={<FileDownloadOutlinedIcon fontSize="small" />}
        tooltip={label}
        ariaLabel={label}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        loading={exporting !== null}
        active={anchor !== null}
        size="small"
        onClick={handleOpenMenu}
      />
      <EditorMenu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={handleCloseMenu}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        {canDownloadMarkdown && (
          <MenuItemPrimitive
            label={t("documentEditor.export.downloadMarkdown", "Download Markdown (.md)")}
            icon={<FileDownloadOutlinedIcon />}
            onClick={handleDownload}
          />
        )}
        <MenuItemPrimitive
          label={t("documentEditor.export.pdf", "Export as PDF")}
          icon={<PictureAsPdfOutlinedIcon />}
          onClick={() => handleExport("pdf")}
        />
        <MenuItemPrimitive
          label={t("documentEditor.export.html", "Export as HTML")}
          icon={<CodeOutlinedIcon />}
          onClick={() => handleExport("html")}
        />
        <MenuItemPrimitive
          label={t("documentEditor.export.googleDoc", "Export to Google Docs")}
          icon={<DescriptionOutlinedIcon />}
          onClick={() => handleExport("google_doc")}
        />
      </EditorMenu>
    </>
  );
};

export interface DocumentRendererProps {
  value: Record<string, unknown>;
  showActions?: boolean;
}

export const DocumentRenderer: React.FC<DocumentRendererProps> = memo(
  ({ value, showActions = true }) => {
    const { t } = useTranslation();
    const theme = useTheme();
    const styles = useMemo(() => documentRendererStyles(theme), [theme]);
    const fullscreenStyles = useMemo(() => fullscreenBodyStyles(theme), [theme]);
    const openTab = useWorkspaceTabsStore((state) => state.openForegroundTab);
    const activeProjectId = useWorkspaceTabsStore(
      (state) => state.activeProjectId
    );
    const [viewMode, setViewMode] = useState<"formatted" | "source">("formatted");
    const [isFullscreen, setIsFullscreen] = useState(false);

    const rawUri = isString(value.uri) ? value.uri : "";
    const assetId = assetIdOf(
      value as { asset_id?: string | null; uri?: string | null }
    );
    const docRef = useMemo<Document>(
      () => ({
        type: "document",
        uri: rawUri,
        asset_id: assetId ?? null
      }),
      [rawUri, assetId]
    );

    const { asset, uri: assetUri } = useAsset({ document: docRef });
    const signedFallbackUrl = useSignedUrl(
      !assetId && isStoredUri(rawUri) ? rawUri : undefined
    );
    const resolvedUrl = assetUri || signedFallbackUrl || "";
    const documentLocation = useMemo<DocumentLocation>(
      () => ({
        projectId: asset?.project_id ?? null,
        path: asset?.workspace_path ?? null
      }),
      [asset?.project_id, asset?.workspace_path]
    );

    const inlinePayload = useMemo(() => {
      // Inline Markdown text wins over raw bytes or an underlying non-Markdown
      // asset (e.g. DocumentInput runtime conversion from PDF/DOCX/HTML).
      if (isString(value.text)) {
        return {
          text: value.text,
          pdfBytes: null as Uint8Array | null,
          pdfDataUrl: ""
        };
      }
      const bytes = documentBytes(value.data);
      if (bytes) {
        if (isPdfBytes(bytes)) {
          return { text: null, pdfBytes: bytes, pdfDataUrl: "" };
        }
        if (!looksBinary(bytes)) {
          return {
            text: new TextDecoder("utf-8").decode(bytes),
            pdfBytes: null,
            pdfDataUrl: ""
          };
        }
      } else if (isString(value.data) && value.data.length > 0) {
        if (value.data.startsWith("data:application/pdf")) {
          return { text: null, pdfBytes: null, pdfDataUrl: value.data };
        }
        return { text: value.data, pdfBytes: null, pdfDataUrl: "" };
      }
      return { text: null, pdfBytes: null, pdfDataUrl: "" };
    }, [value.data, value.text]);

    const inlinePdfBlobUrl = useMemo(() => {
      if (!inlinePayload.pdfBytes) {
        return "";
      }
      const bytes = inlinePayload.pdfBytes;
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer;
      return URL.createObjectURL(new Blob([buffer], { type: "application/pdf" }));
    }, [inlinePayload.pdfBytes]);

    useEffect(() => {
      return () => {
        if (inlinePdfBlobUrl) {
          URL.revokeObjectURL(inlinePdfBlobUrl);
        }
      };
    }, [inlinePdfBlobUrl]);

    const inlinePdfUrl = inlinePdfBlobUrl || inlinePayload.pdfDataUrl;
    const mimeType = resolvedUrl ? getMimeTypeFromUri(resolvedUrl) : undefined;
    const isPdf =
      inlinePayload.text === null &&
      (Boolean(inlinePdfUrl) ||
        asset?.content_type === "application/pdf" ||
        mimeType === "application/pdf" ||
        rawUri.toLowerCase().endsWith(".pdf") ||
        resolvedUrl.toLowerCase().endsWith(".pdf"));
    const pdfUrl = isPdf ? resolvedUrl || inlinePdfUrl : "";

    const shouldFetchText =
      inlinePayload.text === null && !isPdf && Boolean(resolvedUrl);

    const {
      data: fetchedText,
      isLoading: isFetchingText,
      error: fetchError
    } = useQuery({
      queryKey: assetId
        ? textAssetKey(assetId)
        : (["documentOutput", resolvedUrl] as const),
      enabled: shouldFetchText,
      queryFn: async () => {
        const response = await fetch(resolvedUrl, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Failed to load document (${response.status})`);
        }
        return response.text();
      }
    });

    const text = inlinePayload.text ?? fetchedText;
    const waitingForAsset =
      inlinePayload.text === null &&
      !isPdf &&
      Boolean(assetId) &&
      !resolvedUrl &&
      !asset;

    const displayTitle =
      asset?.name ||
      (isString(value.name) && value.name) ||
      (isString(value.filename) && value.filename) ||
      documentFileName(rawUri) ||
      documentFileName(resolvedUrl) ||
      t("output.document", "Document");

    const canOpenInTab = Boolean(assetId || resolvedUrl || pdfUrl);

    const handleOpenDocument = useCallback(() => {
      const targetUri = resolvedUrl || pdfUrl;
      if (!assetId && !targetUri) {
        return;
      }
      const openInTextEditor = asset
        ? isTextAsset(asset) || isSpreadsheetAsset(asset)
        : Boolean(assetId && !isPdf);
      openTab({
        type: openInTextEditor ? "text" : "document",
        ref: openInTextEditor ? (asset?.id ?? assetId!) : targetUri,
        mode: openInTextEditor ? "edit" : "view",
        title: displayTitle,
        projectId: asset?.project_id ?? activeProjectId ?? LOOSE_PROJECT_ID
      });
    }, [
      activeProjectId,
      asset,
      assetId,
      displayTitle,
      isPdf,
      openTab,
      pdfUrl,
      resolvedUrl
    ]);

    const handleToggleViewMode = useCallback(() => {
      setViewMode((current) =>
        current === "formatted" ? "source" : "formatted"
      );
    }, []);

    const handleDownloadMarkdown = useCallback(() => {
      if (text === undefined) {
        return;
      }
      triggerBlobDownload(
        text,
        downloadFileName(displayTitle, "md"),
        "text/markdown;charset=utf-8"
      );
    }, [displayTitle, text]);

    const handleDownloadPdf = useCallback(() => {
      if (!pdfUrl) {
        return;
      }
      triggerUrlDownload(pdfUrl, downloadFileName(displayTitle, "pdf"));
    }, [displayTitle, pdfUrl]);

    const handleOpenFullscreen = useCallback(() => {
      setIsFullscreen(true);
    }, []);

    const handleCloseFullscreen = useCallback(() => {
      setIsFullscreen(false);
    }, []);

    // Nothing readable or openable at all — preserve JSON fallback.
    if (
      inlinePayload.text === null &&
      !assetId &&
      !resolvedUrl &&
      !pdfUrl
    ) {
      return <JSONRenderer value={value} showActions={showActions} />;
    }

    const openTooltip = assetId && !isPdf
      ? t("output.openInDocumentEditor", "Open in document editor")
      : t("output.openDocument", "Open document");

    const sourceToggleTooltip =
      viewMode === "formatted"
        ? t("output.viewMarkdownSource", "View Markdown source")
        : t("output.viewFormattedDocument", "View formatted document");

    const renderCommands = (inFullscreen: boolean) => (
      <FlexRow align="center" gap={GAP.none} className="doc-output-actions">
        {text !== undefined && (
          <ToolbarIconButton
            icon={
              viewMode === "formatted" ? (
                <CodeOutlinedIcon fontSize="small" />
              ) : (
                <ArticleOutlinedIcon fontSize="small" />
              )
            }
            tooltip={sourceToggleTooltip}
            ariaLabel={sourceToggleTooltip}
            active={viewMode === "source"}
            size="small"
            onClick={handleToggleViewMode}
          />
        )}
        {text !== undefined && text.length > 0 && (
          <CopyButton
            value={text}
            tooltip={t("output.copyDocument", "Copy Markdown")}
            buttonSize="small"
            tooltipPlacement="bottom"
          />
        )}
        {assetId && !isPdf ? (
          <DocumentExportAction
            assetId={assetId}
            onDownloadMarkdown={handleDownloadMarkdown}
            canDownloadMarkdown={text !== undefined}
          />
        ) : text !== undefined ? (
          <ToolbarIconButton
            icon={<FileDownloadOutlinedIcon fontSize="small" />}
            tooltip={t("output.downloadDocument", "Download Markdown")}
            ariaLabel={t("output.downloadDocument", "Download Markdown")}
            size="small"
            onClick={handleDownloadMarkdown}
          />
        ) : pdfUrl ? (
          <ToolbarIconButton
            icon={<FileDownloadOutlinedIcon fontSize="small" />}
            tooltip={t("output.downloadPdf", "Download PDF")}
            ariaLabel={t("output.downloadPdf", "Download PDF")}
            size="small"
            onClick={handleDownloadPdf}
          />
        ) : null}
        {canOpenInTab && (
          <OpenDocumentButton onOpen={handleOpenDocument} tooltip={openTooltip} />
        )}
        {!inFullscreen && (
          <ToolbarIconButton
            icon={<FullscreenIcon fontSize="small" />}
            tooltip={t("i18n-next119.markdown.enterFullscreen", "Fullscreen")}
            ariaLabel={t("i18n-next119.markdown.enterFullscreen", "Fullscreen")}
            size="small"
            onClick={handleOpenFullscreen}
          />
        )}
      </FlexRow>
    );

    const renderDocumentBody = () => {
      if (isPdf && pdfUrl) {
        return (
          <iframe
            src={pdfUrl}
            className="doc-output-pdf nodrag nopan nowheel"
            title={displayTitle || t("output.pdfOutput")}
          />
        );
      }

      if (waitingForAsset || (shouldFetchText && isFetchingText)) {
        return (
          <div className="doc-output-center">
            <LoadingSpinner
              size="small"
              text={t("output.loadingDocument", "Loading document…")}
            />
          </div>
        );
      }

      if (fetchError) {
        return (
          <div className="doc-output-center">
            <EmptyState
              variant="error"
              title={t("output.documentLoadError", "Could not load document")}
              description={
                fetchError instanceof Error
                  ? fetchError.message
                  : String(fetchError)
              }
            />
          </div>
        );
      }

      if (text === undefined || text.trim() === "") {
        return (
          <div className="doc-output-center">
            <EmptyState
              title={t("output.emptyDocument", "Empty document")}
              description={t(
                "output.emptyDocumentDescription",
                "This document has no text yet."
              )}
            />
          </div>
        );
      }

      if (viewMode === "source") {
        return <pre className="doc-output-source">{text}</pre>;
      }

      return <MarkdownContent content={text} location={documentLocation} />;
    };

    return (
      <>
        <div className="doc-output-renderer" css={styles}>
          <div
            className="doc-output-header nodrag nopan"
            onPointerDown={stopPointer}
            onMouseDown={stopPointer}
          >
            <div className="doc-output-title-group">
              <DescriptionOutlinedIcon fontSize="small" />
              <TruncatedText className="doc-output-title" showTooltip>
                {displayTitle}
              </TruncatedText>
            </div>
            {renderCommands(false)}
          </div>

          {isPdf && pdfUrl ? (
            renderDocumentBody()
          ) : (
            <div
              className="doc-output-scroll nodrag nopan nowheel"
              role="region"
              aria-label={displayTitle}
              tabIndex={0}
              onWheelCapture={stopWheel}
              onPointerDown={stopPointer}
              onMouseDown={stopPointer}
              onKeyDownCapture={stopScrollKeys}
            >
              {renderDocumentBody()}
            </div>
          )}
        </div>

        <Dialog
          variant="fullscreen"
          open={isFullscreen}
          onClose={handleCloseFullscreen}
          title={displayTitle}
          titleActions={renderCommands(true)}
        >
          {isPdf && pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="doc-output-pdf"
              style={{ width: "100%", height: "100%", border: "none" }}
              title={displayTitle || t("output.pdfOutput")}
            />
          ) : (
            <Box css={fullscreenStyles}>
              <div className="doc-output-fullscreen-inner">
                {renderDocumentBody()}
              </div>
            </Box>
          )}
        </Dialog>
      </>
    );
  },
  isEqual
);

DocumentRenderer.displayName = "DocumentRenderer";

export default DocumentRenderer;
