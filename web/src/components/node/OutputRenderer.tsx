/** @jsxImportSource @emotion/react */
import React, {
  useMemo,
  useCallback,
  memo,
  useState,
  useRef,
  useEffect
} from "react";
import { useTranslation } from "react-i18next";

import {
  Asset,
  DataframeRef,
  Datetime,
  Message,
  NPArray,
  TaskPlan,
  Task,
  CalendarEvent,
  PlotlyConfig,
  SVGElement,
  AssetRef
} from "../../stores/ApiTypes";
import ThreadMessageList from "./ThreadMessageList";
import CalendarEventView from "./CalendarEventView";

import {
  Container,
  EmptyState,
  LoadingSpinner,
  BORDER_RADIUS,
  List,
  ListItem,
  ListItemText, getSpacingPx, SPACING
} from "../ui_primitives";
import ListTable from "./DataTable/ListTable";
import ImageView from "./ImageView";
import AssetViewer from "../assets/AssetViewer";
import TaskPlanView from "./TaskPlanView";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import isEqual from "../../utils/isEqual";
import { getAudioMimeType } from "../../utils/audioFormat";
import { Chunk } from "../../stores/ApiTypes";
import TaskView from "./TaskView";
import { trpc } from "../../trpc/client";
import {
  getSketchId,
  resolveSketchDocument,
  getTimelineId,
  resolveTimelineSequence,
  isRecord,
  isStoredUri
} from "./outputValueResolvers";
import {
  isBoolean,
  isNumber,
  isString
} from "../../utils/typePredicates";
import SketchRenderer from "../sketch/SketchRenderer";

/** In-flight raw straight-alpha RGBA image format (see protocol RAW_RGBA_MIME). */
const RAW_RGBA_MIME = "image/x-raw-rgba";

const FULL_SIZE_STYLE: React.CSSProperties = { width: "100%", height: "100%" };
const AUDIO_WRAPPER_STYLE: React.CSSProperties = { padding: getSpacingPx(SPACING.xl) };
const IFRAME_STYLE: React.CSSProperties = { width: "100%", height: "100%", minHeight: 320, border: "none" };
const IFRAME_PDF_STYLE: React.CSSProperties = { width: "100%", height: "100%", minHeight: 360, border: "none" };
const DOCUMENT_LINK_STYLE: React.CSSProperties = { padding: getSpacingPx(SPACING.lg) };
const MODEL_3D_WRAPPER_STYLE: React.CSSProperties = {
  width: "100%",
  height: "100%",
  minHeight: 0,
  display: "flex",
  flex: 1
};
const SCROLL_CONTAINER_STYLE: React.CSSProperties = {
  height: "100%",
  overflow: "auto",
  cursor: "grab",
  userSelect: "none"
};
const TRUNCATION_STYLE: React.CSSProperties = {
  margin: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.lg)}`,
  padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.md)}`,
  borderRadius: BORDER_RADIUS.lg,
  background: "rgba(var(--palette-warning-mainChannel) / 0.12)",
  border: "1px solid rgba(var(--palette-warning-mainChannel) / 0.35)",
  color: "var(--palette-text-primary)",
  fontSize: "0.85em"
};

const LIST_ITEM_SX = {
  borderRadius: BORDER_RADIUS.sm,
  bgcolor: "background.paper",
  boxShadow: 1,
  mb: 1,
  px: 2
} as const;
const AUDIO_CHUNK_ITEM_SX = {
  alignItems: "flex-start",
  borderRadius: BORDER_RADIUS.sm,
  bgcolor: "background.paper",
  boxShadow: 1,
  mb: 1,
  px: 2,
  display: "block"
} as const;
const LIST_WRAPPER_SX = { p: 1 } as const;
const MONOSPACE_SX = {
  fontFamily: "var(--fontFamily2)",
  fontSize: "var(--fontSizeNormal)"
} as const;
const PRE_WRAP_SX = { whiteSpace: "pre-wrap", color: "text.primary" } as const;
const PRE_WRAP_PRIMARY_SX = { whiteSpace: "pre-wrap" } as const;

import { isBitmapImage } from "@nodetool-ai/protocol";

// Encodes the raw-RGBA in-flight format to a PNG data URL. Shared with the
// in-browser run path (`materializeBrowserOutputs`), which normalizes the same
// format at the run boundary; re-exported here for existing callers/tests.
import { rawRgbaToPngDataUrl } from "../../lib/workflow/materializeBrowserOutputs";
export { rawRgbaToPngDataUrl };
import LazyModel3DViewer from "../asset_viewer/LazyModel3DViewer";
import {
  typeFor,
  renderSVGDocument,
  useImageAssets,
  useRevokeBlobUrls,
  useVideoSrc,
  useSignedUrl,
  getMimeTypeFromUri
} from "./output";
import { TextRenderer } from "./output/TextRenderer";
import { BooleanRenderer } from "./output/BooleanRenderer";
import { DatetimeRenderer } from "./output/DatetimeRenderer";
import { EmailRenderer, type Email } from "./output/EmailRenderer";
import { ArrayRenderer } from "./output/ArrayRenderer";
import { AssetGrid } from "./output/AssetGrid";
import { ChunkRenderer } from "./output/ChunkRenderer";
import { ImageComparisonRenderer, type ImageComparisonData } from "./output/ImageComparisonRenderer";
import { JSONRenderer } from "./output/JSONRenderer";
import ObjectRenderer from "./output/ObjectRenderer";
import { RealtimeAudioOutputFromChunks } from "./output";
import PlotlyRenderer from "./output/PlotlyRenderer";
import DataframeRenderer from "./output/DataframeRenderer";
import { isAudioChunkLike, isTextLikeChunk } from "./outputChunkUtils";
import {
  MAX_RENDERED_TEXT_CHARS,
  concatTextChunksSafely,
  documentBytes,
  formatAudioChunkTimestamp,
  groupTextChunks,
  hashStringBounded,
  htmlFromData,
  isPdfBytes,
  stableKeyForOutputValue,
  withOccurrenceSuffix
} from "./outputRendererModel";
import { resolveInlineMediaSource } from "../../utils/resolveMediaUri";
import { extractTextValue } from "../../utils/extractTextValue";
import type { ResolvedMediaUrl } from "../../utils/resolveMediaUri";

const LazyTimelineRenderer = React.lazy(() => import("../timeline/TimelineRenderer"));
const LazyAudioPlayer = React.lazy(() => import("../audio/AudioPlayer"));

const useDraggableScroll = () => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const scrollTop = useRef(0);
  const isDraggingState = useRef(false);

  const handleMouseMoveRef = useRef((e: MouseEvent) => {
    if (!isDragging.current || !scrollRef.current) {
      return;
    }
    e.preventDefault();
    const deltaY = e.clientY - startY.current;
    scrollRef.current.scrollTop = scrollTop.current - deltaY;
  });

  const handleMouseUpRef = useRef(() => {
    if (!scrollRef.current) {
      return;
    }
    isDragging.current = false;
    isDraggingState.current = false;
    scrollRef.current.style.cursor = "grab";
  });

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => handleMouseMoveRef.current(e);
    const handleGlobalMouseUp = () => handleMouseUpRef.current();

    document.addEventListener("mousemove", handleGlobalMouseMove);
    document.addEventListener("mouseup", handleGlobalMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleGlobalMouseMove);
      document.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, []); // Empty deps - listeners set up once and check refs internally

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!scrollRef.current) {
      return;
    }
    isDragging.current = true;
    isDraggingState.current = true;
    startY.current = e.clientY;
    scrollTop.current = scrollRef.current.scrollTop;
    scrollRef.current.style.cursor = "grabbing";
  }, []);

  return {
    scrollRef,
    handleMouseDown,
    isDragging: isDraggingState.current
  };
};

export type OutputRendererProps = {
  value: unknown;
  showTextActions?: boolean;
};

const OutputRenderer: React.FC<OutputRendererProps> = ({
  value,
  showTextActions = true
}) => {
  const { t } = useTranslation();
  const shouldRender = !(
    value === undefined ||
    value === null ||
    (isString(value) && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0) ||
    (isRecord(value) &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0)
  );

  const setOpenAsset = useAssetGridStore((state) => state.setOpenAsset);
  const [openAsset, setLocalOpenAsset] = useState<Asset | null>(null);
  const [openModel3D, setOpenModel3D] = useState<{
    url: string;
    contentType?: string;
  } | null>(null);
  const { scrollRef, handleMouseDown } = useDraggableScroll();

  const type = useMemo(() => typeFor(value), [value]);
  const inlineSketchDocument = useMemo(
    () => (type === "sketch" ? resolveSketchDocument(value) : null),
    [type, value]
  );
  const sketchId = useMemo(
    () => (type === "sketch" ? getSketchId(value) : null),
    [type, value]
  );
  const shouldLoadSketch = Boolean(sketchId && !inlineSketchDocument);
  const sketchQuery = trpc.sketch.get.useQuery(
    { id: sketchId ?? "" },
    {
      enabled: shouldLoadSketch,
      staleTime: 30_000
    }
  );
  const loadedSketchDocument = useMemo(
    () => resolveSketchDocument(sketchQuery.data),
    [sketchQuery.data]
  );
  const sketchDocument = inlineSketchDocument ?? loadedSketchDocument;
  const inlineTimelineSequence = useMemo(
    () => (type === "timeline" ? resolveTimelineSequence(value) : null),
    [type, value]
  );
  const timelineId = useMemo(
    () => (type === "timeline" ? getTimelineId(value) : null),
    [type, value]
  );
  const shouldLoadTimeline = Boolean(timelineId && !inlineTimelineSequence);
  const timelineQuery = trpc.timeline.get.useQuery(
    { id: timelineId ?? "" },
    {
      enabled: shouldLoadTimeline,
      staleTime: 30_000
    }
  );
  const loadedTimelineSequence = useMemo(
    () => resolveTimelineSequence(timelineQuery.data),
    [timelineQuery.data]
  );
  const timelineSequence = inlineTimelineSequence ?? loadedTimelineSequence;
  const documentDataPreview = useMemo(() => {
    if (type !== "document") {
      return { url: "", isPdf: false };
    }

    const bytes = documentBytes((value as Record<string, unknown>)?.data);
    if (!bytes) {
      return { url: "", isPdf: false };
    }

    const isPdf = isPdfBytes(bytes);
    const mimeType = isPdf ? "application/pdf" : "application/octet-stream";
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const url = URL.createObjectURL(new Blob([arrayBuffer], { type: mimeType }));
    return { url, isPdf };
  }, [type, value]);

  useEffect(() => {
    return () => {
      if (documentDataPreview.url) {
        URL.revokeObjectURL(documentDataPreview.url);
      }
    };
  }, [documentDataPreview.url]);

  const computedViewer = useImageAssets(value);
  useRevokeBlobUrls(computedViewer.urls);

  const onDoubleClickAsset = useCallback(
    (index: number) => {
      const asset = computedViewer.assets[index];
      if (asset) {
        setLocalOpenAsset(asset);
        setOpenAsset(asset);
      }
    },
    [computedViewer.assets, setOpenAsset]
  );

  const handleModel3DDoubleClick = useCallback(
    (url: string, contentType?: string) => () => {
      setOpenModel3D({ url, contentType });
    },
    []
  );

  const videoRef = useVideoSrc(type === "video" ? value : undefined);

  // Extract the primary URI from the current value for signing.
  // memory:// URIs are excluded — they're in-memory only and never stored.
  const valueUri = useMemo(() => {
    if (!isRecord(value)) return undefined;
    const v = value;
    if (isStoredUri(v.uri)) return v.uri;
    return undefined;
  }, [value]);
  const signedValueUrl = useSignedUrl(valueUri);

  const renderContent = useMemo(() => {
    // Typed views for property access in switch cases. typeFor() confirms
    // shape at runtime before the value enters each branch.
    const v = value as Record<string, unknown>;

    switch (type) {
      case "plotly_config":
        return <PlotlyRenderer config={value as PlotlyConfig} />;
      case "image_comparison":
        return <ImageComparisonRenderer value={value as ImageComparisonData} />;
      case "image":
        // Preview bitmap from the in-browser runner — paint it directly
        // (zero-copy fast path; no PNG encode/decode).
        if (isBitmapImage(v)) {
          return <ImageView bitmap={v.bitmap as ImageBitmap} />;
        }
        if (Array.isArray(v.data)) {
          const seen = new Map<string, number>();
          return (v.data as (string | Uint8Array)[]).map((item) => (
            <ImageView
              key={withOccurrenceSuffix(stableKeyForOutputValue(item), seen)}
              source={resolveInlineMediaSource(item)}
            />
          ));
        } else {
          let imageSource: ResolvedMediaUrl | "" | Uint8Array;
          if (
            v.mimeType === RAW_RGBA_MIME &&
            v.data instanceof Uint8Array &&
            isNumber(v.width) &&
            isNumber(v.height)
          ) {
            // Raw RGBA can't be decoded by <img>; encode to a PNG data URL.
            imageSource =
              resolveInlineMediaSource(
                rawRgbaToPngDataUrl(v.data, v.width, v.height)
              ) ?? "";
          } else if (isStoredUri(v.uri)) {
            imageSource = signedValueUrl;
          } else if (v.data instanceof Uint8Array) {
            imageSource = v.data;
          } else if (Array.isArray(v.data)) {
            imageSource = new Uint8Array(v.data as number[]);
          } else if (isString(v.data)) {
            imageSource = resolveInlineMediaSource(v.data) ?? "";
          } else {
            imageSource = "";
          }
          return <ImageView source={imageSource} />;
        }
      case "audio": {
        let audioSource: string | Uint8Array;

        if (isStoredUri(v.uri)) {
          audioSource = signedValueUrl;
        } else if (Array.isArray(v.data)) {
          audioSource = new Uint8Array(v.data as number[]);
        } else if (v.data instanceof Uint8Array) {
          audioSource = v.data;
        } else if (isString(v.data)) {
          audioSource = v.data;
        } else {
          audioSource = "";
        }

        const metadata = (v.metadata as { format?: string } | undefined) ?? {};
        // The ref's own format decides the type, so a WAV or FLAC output is
        // tagged, and downloaded, as what it is.
        const mimeType =
          getMimeTypeFromUri(v.uri as string | undefined) ??
          getAudioMimeType(metadata.format) ??
          "audio/mp3";

        return (
          <div className="audio" style={AUDIO_WRAPPER_STYLE}>
            <React.Suspense fallback={<LoadingSpinner size="small" text={t("i18n-next12.output.loadingAudioPlayer")} />}>
              <LazyAudioPlayer
                source={audioSource}
                mimeType={mimeType}
                height={150}
                waveformHeight={150}
              />
            </React.Suspense>
          </div>
        );
      }
      case "html": {
        const uri = isStoredUri(v.uri) ? signedValueUrl : "";
        if (uri) {
          return (
            <iframe
              src={uri}
              sandbox=""
              style={IFRAME_STYLE}
              title={t("i18n-next12.output.htmlOutput")}
            />
          );
        }

        const html = htmlFromData(v.data);

        if (!html) {
          return <TextRenderer text="" showActions={showTextActions} />;
        }

        return (
          <iframe
            srcDoc={html}
            sandbox=""
            style={IFRAME_STYLE}
            title={t("i18n-next12.output.htmlOutput")}
          />
        );
      }
      case "document": {
        const rawUri = isString(v.uri) ? v.uri : "";
        const uriFromRef =
          rawUri && !rawUri.startsWith("memory://") ? signedValueUrl : "";
        const uri = uriFromRef || documentDataPreview.url;
        const mimeType = uriFromRef ? getMimeTypeFromUri(uriFromRef) : undefined;
        const isPdf =
          documentDataPreview.isPdf ||
          mimeType === "application/pdf" ||
          rawUri.toLowerCase().endsWith(".pdf") ||
          uri.toLowerCase().endsWith(".pdf");

        if (uri && isPdf) {
          return (
            <iframe
              src={uri}
              style={IFRAME_PDF_STYLE}
              title={t("i18n-next12.output.pdfOutput")}
            />
          );
        }

        if (uri) {
          return (
            <div className="output value" style={DOCUMENT_LINK_STYLE}>
              <a href={uri} target="_blank" rel="noreferrer">
                {t("i18n-next12.output.openDocument")}
              </a>
            </div>
          );
        }

        return <JSONRenderer value={v} showActions={showTextActions} />;
      }
      case "video":
        return (
          <video
            ref={videoRef}
            controls
            // iOS Safari plays a video inline only with `playsinline`, and
            // decodes no frame at all without a preload hint — without both,
            // the element paints an empty box on a phone.
            playsInline
            preload="metadata"
            // nodrag/nopan stop ReactFlow's drag from capturing the pointer so
            // the native controls (scrub, volume) get the mouse events.
            className="nodrag nopan"
            aria-label={t("i18n-next12.output.videoOutput")}
            style={FULL_SIZE_STYLE}
          />
        );
      case "model_3d": {
        const rawUri: string = isString(v.uri) ? v.uri : "";

        if (!rawUri) {
          return <JSONRenderer value={v} showActions={showTextActions} />;
        }

        const url = signedValueUrl;
        const format = isString(v.format) ? v.format : undefined;
        const contentType = getMimeTypeFromUri(url) ||
          (format === "gltf" ? "model/gltf+json" : "model/gltf-binary");

        return (
          <div
            style={MODEL_3D_WRAPPER_STYLE}
          >
            <LazyModel3DViewer
              url={url}
              compact={true}
              onDoubleClick={handleModel3DDoubleClick(url, contentType)}
            />
          </div>
        );
      }
      case "sketch": {
        if (sketchDocument) {
          return (
            <SketchRenderer
              document={sketchDocument}
              ariaLabel={t("i18n-next12.output.sketchPreview")}
              showDimensions
            />
          );
        }
        if (shouldLoadSketch && sketchQuery.isLoading) {
          return <LoadingSpinner size="small" text={t("i18n-next12.output.loadingSketch")} />;
        }
        if (sketchQuery.isError) {
          return (
            <EmptyState
              variant="error"
              title={t("i18n-next12.output.sketchLoadError")}
              description={sketchQuery.error.message}
            />
          );
        }
        return (
          <EmptyState
            title={t("i18n-next12.output.noSketchSelected")}
            description={t("i18n-next12.output.chooseSketch")}
          />
        );
      }
      case "timeline": {
        if (timelineSequence) {
          return (
            <React.Suspense fallback={<LoadingSpinner size="small" text={t("i18n-next12.output.loadingTimelinePreview")} />}>
              <LazyTimelineRenderer
                sequence={timelineSequence}
                ariaLabel={t("i18n-next12.output.timelinePreview")}
                showMetadata
              />
            </React.Suspense>
          );
        }
        if (shouldLoadTimeline && timelineQuery.isLoading) {
          return <LoadingSpinner size="small" text={t("i18n-next12.output.loadingTimeline")} />;
        }
        if (timelineQuery.isError) {
          return (
            <EmptyState
              variant="error"
              title={t("i18n-next12.output.timelineLoadError")}
              description={timelineQuery.error.message}
            />
          );
        }
        return (
          <EmptyState
            title={t("i18n-next12.output.noTimelineSelected")}
            description={t("i18n-next12.output.chooseTimeline")}
          />
        );
      }
      case "dataframe":
        return <DataframeRenderer dataframe={value as DataframeRef} />;
      case "np_array":
        return (
          <div className="tensor nodrag">
            <ArrayRenderer array={value as NPArray} />
          </div>
        );
      case "object": {
        const keys = Object.keys(v);
        const vals = Object.values(v);

        if (keys.length === 0) {
          return null;
        }

        if (keys.length === 1) {
          const singleValue = vals[0];
          if (isString(singleValue)) {
            return (
              <TextRenderer text={singleValue} showActions={showTextActions} />
            );
          }
          if (isNumber(singleValue)) {
            return (
              <TextRenderer
                text={String(singleValue)}
                showActions={showTextActions}
              />
            );
          }
          if (isBoolean(singleValue)) {
            return <BooleanRenderer value={singleValue} />;
          }
          return (
            <OutputRenderer value={singleValue} showTextActions={showTextActions} />
          );
        }

        return (
          <ObjectRenderer
            value={v}
            renderValue={(item) => (
              <OutputRenderer value={item} showTextActions={showTextActions} />
            )}
          />
        );
      }
      case "task":
        return <TaskView task={value as Task} />;
      case "task_plan":
        return <TaskPlanView data={value as TaskPlan} />;
      case "calendar_event":
        return <CalendarEventView event={value as CalendarEvent} />;
      case "array": {
        if (!Array.isArray(value)) return null;
        const arr: unknown[] = value;
        if (arr.length > 0) {
          if (arr[0] === undefined || arr[0] === null) {
            return null;
          }
          if (isString(arr[0]) && arr.every(isString)) {
            const seen = new Map<string, number>();
            return (
              <div
                ref={scrollRef}
                onMouseDown={handleMouseDown}
                className="nodrag"
                style={SCROLL_CONTAINER_STYLE}
              >
                <List sx={LIST_WRAPPER_SX}>
                  {arr.map((item) => (
                    <ListItem
                      key={withOccurrenceSuffix(
                        stableKeyForOutputValue(item),
                        seen
                      )}
                      sx={LIST_ITEM_SX}
                    >
                      <ListItemText
                        primaryTypographyProps={{
                          sx: PRE_WRAP_PRIMARY_SX
                        }}
                        primary={item}
                      />
                    </ListItem>
                  ))}
                </List>
              </div>
            );
          }
          if (isNumber(arr[0])) {
            return (
              <ListTable data={arr as number[]} data_type="float" editable={false} />
            );
          }
          if (isRecord(arr[0])) {
            if (arr.every(isAudioChunkLike)) {
              const seen = new Map<string, number>();
              return (
                <div
                  ref={scrollRef}
                  onMouseDown={handleMouseDown}
                  className="nodrag"
                  style={SCROLL_CONTAINER_STYLE}
                >
                  <List sx={LIST_WRAPPER_SX}>
                    {arr.map((chunk) => {
                      const key = withOccurrenceSuffix(
                        `audio-chunk:${chunk.timestamp[0]}:${chunk.timestamp[1]}:${hashStringBounded(chunk.text)}`,
                        seen
                      );
                      return (
                        <ListItem
                          key={key}
                          sx={AUDIO_CHUNK_ITEM_SX}
                        >
                          <ListItemText
                            primary={`${formatAudioChunkTimestamp(chunk.timestamp[0])} → ${formatAudioChunkTimestamp(chunk.timestamp[1])}`}
                            secondary={chunk.text}
                            primaryTypographyProps={{
                              sx: MONOSPACE_SX
                            }}
                            secondaryTypographyProps={{
                              sx: PRE_WRAP_SX
                            }}
                          />
                        </ListItem>
                      );
                    })}
                  </List>
                </div>
              );
            }
            const first = arr[0] as Record<string, unknown>;
            if (first.type === "chunk") {
              const chunks = arr as Chunk[];
              const audioChunks = chunks.filter(
                (c) => c.content_type === "audio"
              );
              if (audioChunks.length >= 2) {
                const firstMeta = audioChunks[0].content_metadata;
                return (
                  <RealtimeAudioOutputFromChunks
                    chunks={audioChunks}
                    sampleRate={(firstMeta?.sample_rate as number | undefined) ?? 22000}
                    channels={(firstMeta?.channels as number | undefined) ?? 1}
                  />
                );
              }
              const groups = groupTextChunks(chunks, isTextLikeChunk);
              const seen = new Map<string, number>();
              return (
                <Container>
                  {groups.map((g, idx) => {
                    if (g.kind === "text") {
                      const { text, truncated, totalChunks } =
                        concatTextChunksSafely(g.chunks);
                      if (text.length === 0) return null;
                      return (
                        <div key={`text:${idx}:${hashStringBounded(text)}`}>
                          {truncated && (
                            <div style={TRUNCATION_STYLE}>
                              Output truncated (showing first{" "}
                              {MAX_RENDERED_TEXT_CHARS.toLocaleString()} chars
                              of {totalChunks.toLocaleString()} chunks).
                            </div>
                          )}
                          <TextRenderer
                            text={text}
                            showActions={showTextActions}
                          />
                        </div>
                      );
                    }
                    const c = g.chunk;
                    return (
                      <OutputRenderer
                        key={withOccurrenceSuffix(
                          `chunk:${c.content_type ?? ""}:${c.done ? 1 : 0
                          }:${hashStringBounded(
                            isString(c.content) ? c.content : ""
                          )}`,
                          seen
                        )}
                        value={c}
                        showTextActions={showTextActions}
                      />
                    );
                  })}
                </Container>
              );
            }
            if (first.type === "svg_element") {
              return renderSVGDocument(arr as SVGElement[]);
            }
            if (first.type === "thread_message") {
              return <ThreadMessageList messages={arr as Message[]} />;
            }
            if (first.type === "image") {
              return (
                <AssetGrid values={arr as AssetRef[]} onOpenIndex={onDoubleClickAsset} />
              );
            }
            if (
              isString(first.type) &&
              ["audio", "video", "html", "sketch"].includes(first.type)
            ) {
              const seen = new Map<string, number>();
              return (
                <Container>
                  {arr.map((item) => (
                    <OutputRenderer
                      key={withOccurrenceSuffix(
                        stableKeyForOutputValue(item),
                        seen
                      )}
                      value={item}
                      showTextActions={showTextActions}
                    />
                  ))}
                </Container>
              );
            }
            // Rows are matched to columns by key, over the union of keys, and
            // null rows are tolerated (DataframeRenderer normalizes them).
            const df = {
              type: "dataframe" as const,
              uri: "",
              rows: arr as Record<string, unknown>[]
            } as DataframeRef;
            return <DataframeRenderer dataframe={df} />;
          }
        }

        return (
          <Container>
            {(() => {
              const seen = new Map<string, number>();
              return arr.map((item) => (
                <OutputRenderer
                  key={withOccurrenceSuffix(stableKeyForOutputValue(item), seen)}
                  value={item}
                  showTextActions={showTextActions}
                />
              ));
            })()}
          </Container>
        );
      }
      case "segmentation_result":
        return (
          <div>
            {Object.entries(v).map(([key, val]) => (
              <OutputRenderer
                key={key}
                value={val}
                showTextActions={showTextActions}
              />
            ))}
          </div>
        );
      case "classification_result":
        return (
          <div>
            {String(v["label"])}: {String(v["score"])}
          </div>
        );
      case "svg_element":
        return renderSVGDocument(value as SVGElement[]);
      case "boolean": {
        return <BooleanRenderer value={value as boolean} />;
      }
      case "datetime": {
        return <DatetimeRenderer value={value as Datetime} />;
      }
      case "email":
        return <EmailRenderer value={value as Email} />;
      case "chunk": {
        const chunk = value as Chunk;
        return <ChunkRenderer chunk={chunk} />;
      }
      case "json":
        return <JSONRenderer value={v} showActions={showTextActions} />;
      case "text":
        // A saved text generation reloads as `{ type: "text", text, uri }`;
        // show its content, not the ref.
        return (
          <TextRenderer
            text={extractTextValue(value)}
            showActions={showTextActions}
          />
        );
      default:
        if (isRecord(value)) {
          return <JSONRenderer value={value} showActions={showTextActions} />;
        }
        return (
          <TextRenderer
            text={isString(value) ? value : String(value ?? "")}
            showActions={showTextActions}
          />
        );
    }
  }, [
    value,
    type,
    signedValueUrl,
    documentDataPreview,
    onDoubleClickAsset,
    videoRef,
    handleMouseDown,
    scrollRef,
    showTextActions,
    handleModel3DDoubleClick,
    sketchDocument,
    shouldLoadSketch,
    sketchQuery.error,
    sketchQuery.isError,
    sketchQuery.isLoading,
    timelineSequence,
    shouldLoadTimeline,
    timelineQuery.error,
    timelineQuery.isError,
    timelineQuery.isLoading
  ]);

  const handleCloseAsset = useCallback(() => {
    setLocalOpenAsset(null);
  }, []);

  const handleCloseModel3D = useCallback(() => {
    setOpenModel3D(null);
  }, []);

  if (!shouldRender) {
    return null;
  }

  return (
    <div style={FULL_SIZE_STYLE}>
      {openAsset && (
        <AssetViewer
          asset={openAsset}
          sortedAssets={
            computedViewer.assets.length ? computedViewer.assets : undefined
          }
          open={openAsset !== null}
          onClose={handleCloseAsset}
        />
      )}
      {openModel3D && (
        <AssetViewer
          url={openModel3D.url}
          contentType={openModel3D.contentType}
          open={true}
          onClose={handleCloseModel3D}
        />
      )}
      {renderContent}
    </div>
  );
};

export default memo(OutputRenderer, isEqual);
