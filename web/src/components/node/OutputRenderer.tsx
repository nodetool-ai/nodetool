/** @jsxImportSource @emotion/react */
import React, {
  useMemo,
  useCallback,
  memo,
  useState,
  useRef,
  useEffect
} from "react";

import {
  Asset,
  DataframeRef,
  Datetime,
  Message,
  NPArray,
  TaskPlan,
  Task,
  CalendarEvent
} from "../../stores/ApiTypes";
import AudioPlayer from "../audio/AudioPlayer";
import ThreadMessageList from "./ThreadMessageList";
import CalendarEventView from "./CalendarEventView";
import { Container, List, ListItem, ListItemText } from "@mui/material";
import ListTable from "./DataTable/ListTable";
import ImageView from "./ImageView";
import AssetViewer from "../assets/AssetViewer";
import TaskPlanView from "./TaskPlanView";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import isEqual from "lodash/isEqual";
import { Chunk } from "../../stores/ApiTypes";
import TaskView from "./TaskView";
import Model3DViewer from "../asset_viewer/Model3DViewer";
import {
  typeFor,
  renderSVGDocument,
  useImageAssets,
  useRevokeBlobUrls,
  useVideoSrc
} from "./output";
import { TextRenderer } from "./output/TextRenderer";
import { BooleanRenderer } from "./output/BooleanRenderer";
import { DatetimeRenderer } from "./output/DatetimeRenderer";
import { EmailRenderer } from "./output/EmailRenderer";
import { ArrayRenderer } from "./output/ArrayRenderer";
import { AssetGrid } from "./output/AssetGrid";
import { ChunkRenderer } from "./output/ChunkRenderer";
import { ImageComparisonRenderer } from "./output/ImageComparisonRenderer";
import { JSONRenderer } from "./output/JSONRenderer";
import ObjectRenderer from "./output/ObjectRenderer";
import { RealtimeAudioOutput } from "./output";
import PlotlyRenderer from "./output/PlotlyRenderer";
import DataframeRenderer from "./output/DataframeRenderer";

// Keep this large for UX (big LLM outputs), but bounded to avoid browser OOM /
// `RangeError: Invalid string length` when streams run away.
const MAX_RENDERED_TEXT_CHARS = 5_000_000;

const hashStringBounded = (input: string, sampleSize = 2048): string => {
  const len = input.length;
  const head = input.slice(0, sampleSize);
  const tail =
    len > sampleSize ? input.slice(Math.max(0, len - sampleSize)) : "";
  // djb2-ish, bounded to avoid O(n) over huge strings
  const hashPart = (s: string): number => {
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
      h = (h * 33) ^ s.charCodeAt(i);
    }
    return h >>> 0;
  };
  const h1 = hashPart(head).toString(36);
  const h2 = tail ? hashPart(tail).toString(36) : "";
  return h2 ? `${h1}-${h2}-${len}` : `${h1}-${len}`;
};

const hashBytesBounded = (
  input: ArrayLike<number>,
  sampleSize = 2048
): string => {
  const len = input.length ?? 0;
  const headLen = Math.min(len, sampleSize);
  const tailStart = len > sampleSize ? Math.max(0, len - sampleSize) : 0;

  const hashPart = (start: number, end: number): number => {
    let h = 5381;
    for (let i = start; i < end; i++) {
      h = (h * 33) ^ (input[i] ?? 0);
    }
    return h >>> 0;
  };

  const h1 = hashPart(0, headLen).toString(36);
  const h2 = len > sampleSize ? hashPart(tailStart, len).toString(36) : "";
  return h2 ? `${h1}-${h2}-${len}` : `${h1}-${len}`;
};

const withOccurrenceSuffix = (
  base: string,
  seen: Map<string, number>
): string => {
  const n = seen.get(base) ?? 0;
  seen.set(base, n + 1);
  return n === 0 ? base : `${base}-${n}`;
};

const stableKeyForOutputValue = (v: any): string => {
  if (v === null) {
    return "null";
  }
  if (v === undefined) {
    return "undefined";
  }
  const t = typeof v;
  if (t === "string") {
    return `str:${hashStringBounded(v)}`;
  }
  if (t === "number" || t === "boolean" || t === "bigint") {
    return `${t}:${String(v)}`;
  }
  if (v instanceof Uint8Array) {
    return `u8:${hashBytesBounded(v)}`;
  }
  if (Array.isArray(v)) {
    // Often byte arrays or lists of primitives
    return `arr:${hashBytesBounded(v)}`;
  }
  if (t === "object") {
    const id = (v as any).id;
    if (typeof id === "string" || typeof id === "number") {
      return `id:${String(id)}`;
    }
    const uri = (v as any).uri;
    if (typeof uri === "string" && uri) {
      return `uri:${uri}`;
    }
    const type = (v as any).type;
    const name = (v as any).name;
    if (typeof type === "string" && typeof name === "string") {
      return `type-name:${type}:${name}`;
    }
    if (typeof type === "string") {
      return `type:${type}:${hashStringBounded(
        JSON.stringify(Object.keys(v).slice(0, 50))
      )}`;
    }
    try {
      return `json:${hashStringBounded(JSON.stringify(v))}`;
    } catch {
      return "object";
    }
  }
  return `other:${String(v)}`;
};

const concatTextChunksSafely = (
  chunks: Chunk[]
): {
  text: string;
  truncated: boolean;
  totalChunks: number;
  usedChunks: number;
} => {
  const parts: string[] = [];
  let used = 0;
  let currentLen = 0;

  for (const c of chunks) {
    if (!c) {
      continue;
    }
    const piece =
      typeof (c as any).content === "string" ? (c as any).content : "";
    if (!piece) {
      used++;
      continue;
    }

    const remaining = MAX_RENDERED_TEXT_CHARS - currentLen;
    if (remaining <= 0) {
      return {
        text: parts.join(""),
        truncated: true,
        totalChunks: chunks.length,
        usedChunks: used
      };
    }

    if (piece.length <= remaining) {
      parts.push(piece);
      currentLen += piece.length;
      used++;
      continue;
    }

    parts.push(piece.slice(0, remaining));
    currentLen += remaining;
    used++;

    return {
      text: parts.join(""),
      truncated: true,
      totalChunks: chunks.length,
      usedChunks: used
    };
  }

  return {
    text: parts.join(""),
    truncated: false,
    totalChunks: chunks.length,
    usedChunks: used
  };
};

// Custom hook for draggable scrolling
const useDraggableScroll = () => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const scrollTop = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!scrollRef.current) {
      return;
    }
    isDragging.current = true;
    startY.current = e.clientY;
    scrollTop.current = scrollRef.current.scrollTop;
    scrollRef.current.style.cursor = "grabbing";
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !scrollRef.current) {
      return;
    }
    e.preventDefault();
    const deltaY = e.clientY - startY.current;
    scrollRef.current.scrollTop = scrollTop.current - deltaY;
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!scrollRef.current) {
      return;
    }
    isDragging.current = false;
    scrollRef.current.style.cursor = "grab";
  }, []);

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => handleMouseMove(e);
    const handleGlobalMouseUp = () => handleMouseUp();

    if (isDragging.current) {
      document.addEventListener("mousemove", handleGlobalMouseMove);
      document.addEventListener("mouseup", handleGlobalMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleGlobalMouseMove);
      document.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  return {
    scrollRef,
    handleMouseDown,
    isDragging: isDragging.current
  };
};

export type OutputRendererProps = {
  value: any;
  showTextActions?: boolean;
};

// all helpers/styles/hooks moved to ./output/*

const OutputRenderer: React.FC<OutputRendererProps> = ({
  value,
  showTextActions = true
}) => {
  const shouldRender = !(
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === "object" &&
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

  const handleModel3DClick = useCallback((url: string, contentType?: string) => () => {
    setOpenModel3D({ url, contentType });
  }, []);

  const videoRef = useVideoSrc(type === "video" ? value : undefined);

  const renderContent = useMemo(() => {
    switch (type) {
      case "plotly_config":
        return <PlotlyRenderer config={value} />;
      case "image_comparison":
        return <ImageComparisonRenderer value={value} />;
      case "image":
        if (Array.isArray(value.data)) {
          const seen = new Map<string, number>();
          return value.data.map((v: any) => (
            <ImageView
              key={withOccurrenceSuffix(stableKeyForOutputValue(v), seen)}
              source={v}
            />
          ));
        } else {
          let imageSource: string | Uint8Array;
          if (value?.uri && value.uri !== "" && !value.uri.startsWith("memory://")) {
            imageSource = value.uri;
          } else if (value?.data instanceof Uint8Array) {
            imageSource = value.data;
          } else if (Array.isArray(value?.data)) {
            imageSource = new Uint8Array(value.data);
          } else if (typeof value?.data === "string") {
            imageSource = value.data;
          } else {
            imageSource = "";
          }
          return <ImageView source={imageSource} />;
        }
      case "audio": {
        // Handle different audio data formats
        let audioSource: string | Uint8Array;

        if (value?.uri && value.uri !== "" && !value.uri.startsWith("memory://")) {
          // Use URI if available
          audioSource = value.uri;
        } else if (Array.isArray(value?.data)) {
          // Convert array of bytes to Uint8Array
          audioSource = new Uint8Array(value.data);
        } else if (value?.data instanceof Uint8Array) {
          // Already a Uint8Array
          audioSource = value.data;
        } else if (typeof value?.data === "string") {
          // Data URI or base64 string
          audioSource = value.data;
        } else {
          // Fallback
          audioSource = "";
        }

        const metadata = (value as any).metadata || {};
        const mimeType = metadata.format === "wav" ? "audio/wav" : "audio/mp3";

        return (
          <div className="audio" style={{ padding: "1em" }}>
            <AudioPlayer
              source={audioSource}
              mimeType={mimeType}
              height={150}
              waveformHeight={150}
            />
          </div>
        );
      }
      case "video":
        return (
          <video
            ref={videoRef}
            controls
            style={{ width: "100%", height: "100%" }}
          />
        );
      case "model_3d": {
        const url: string =
          (value && typeof value === "object" && typeof value.uri === "string"
            ? value.uri
            : "") || "";

        if (!url) {
          return <JSONRenderer value={value} showActions={showTextActions} />;
        }

        const format =
          value && typeof value === "object" && typeof (value as any).format === "string"
            ? ((value as any).format as string)
            : undefined;
        const contentType =
          format === "gltf" ? "model/gltf+json" : "model/gltf-binary";

        return (
          <div style={{ width: "100%", height: "100%", minHeight: 0 }}>
            <Model3DViewer
              url={url}
              compact={true}
              onClick={handleModel3DClick(url, contentType)}
            />
          </div>
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
        const keys = Object.keys(value);
        const vals = Object.values(value);

        // For empty objects, return null
        if (keys.length === 0) {
          return null;
        }

        // Single-key object: render the value directly (unwrap the object)
        if (keys.length === 1) {
          const singleValue = vals[0];
          // If it's a primitive, render it directly
          if (typeof singleValue === "string") {
            return (
              <TextRenderer text={singleValue} showActions={showTextActions} />
            );
          }
          if (typeof singleValue === "number") {
            return (
              <TextRenderer
                text={String(singleValue)}
                showActions={showTextActions}
              />
            );
          }
          if (typeof singleValue === "boolean") {
            return <BooleanRenderer value={singleValue} />;
          }
          // For objects/arrays, recurse
          return (
            <OutputRenderer value={singleValue} showTextActions={showTextActions} />
          );
        }

        // Multi-key object: use ObjectRenderer for clean sectioned display
        return (
          <ObjectRenderer
            value={value}
            renderValue={(v) => (
              <OutputRenderer value={v} showTextActions={showTextActions} />
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
      case "array":
        if (value.length > 0) {
          if (value[0] === undefined || value[0] === null) {
            return null;
          }
          if (typeof value[0] === "string") {
            const seen = new Map<string, number>();
            return (
              <div
                ref={scrollRef}
                onMouseDown={handleMouseDown}
                className="nodrag"
                style={{
                  height: "100%",
                  overflow: "auto",
                  cursor: "grab",
                  userSelect: "none"
                }}
              >
                <List sx={{ p: 1 }}>
                  {value.map((v: any) => (
                    <ListItem
                      key={withOccurrenceSuffix(
                        stableKeyForOutputValue(v),
                        seen
                      )}
                      sx={{
                        borderRadius: 2,
                        bgcolor: "background.paper",
                        boxShadow: 1,
                        mb: 1,
                        px: 2
                      }}
                    >
                      <ListItemText
                        primaryTypographyProps={{
                          sx: { whiteSpace: "pre-wrap" }
                        }}
                        primary={v}
                      />
                    </ListItem>
                  ))}
                </List>
              </div>
            );
          }
          if (typeof value[0] === "number") {
            return (
              <ListTable data={value} data_type="float" editable={false} />
            );
          }
          if (typeof value[0] === "object") {
            if (value[0].type === "chunk") {
              const chunks = value as Chunk[];
              const allText = chunks.every((c) => c.content_type === "text");
              if (allText) {
                const { text, truncated, totalChunks } =
                  concatTextChunksSafely(chunks);
                return (
                  <div>
                    {truncated && (
                      <div
                        style={{
                          margin: "0.5em 0.75em",
                          padding: "0.4em 0.6em",
                          borderRadius: 8,
                          background: "rgba(255, 193, 7, 0.12)",
                          border: "1px solid rgba(255, 193, 7, 0.35)",
                          color: "rgba(255, 255, 255, 0.85)",
                          fontSize: "0.85em"
                        }}
                      >
                        Output truncated (showing first{" "}
                        {MAX_RENDERED_TEXT_CHARS.toLocaleString()} chars of{" "}
                        {totalChunks.toLocaleString()} chunks).
                      </div>
                    )}
                    <TextRenderer text={text} showActions={showTextActions} />
                  </div>
                );
              }
              const audioChunks = chunks.filter(
                (c) => c.content_type === "audio"
              );
              if (audioChunks.length >= 2) {
                const firstMeta = (audioChunks[0] as any).content_metadata;
                return (
                  <RealtimeAudioOutput
                    chunks={audioChunks}
                    sampleRate={firstMeta?.sample_rate || 22000}
                    channels={firstMeta?.channels || 1}
                  />
                );
              }
              // Mixed or non-text chunks: render each chunk individually
              const seen = new Map<string, number>();
              return (
                <Container>
                  {chunks.map((c) => (
                    <OutputRenderer
                      key={withOccurrenceSuffix(
                        `chunk:${(c as any)?.content_type ?? ""}:${(c as any)?.done ? 1 : 0
                        }:${hashStringBounded(
                          typeof (c as any)?.content === "string"
                            ? (c as any).content
                            : ""
                        )}`,
                        seen
                      )}
                      value={c}
                      showTextActions={showTextActions}
                    />
                  ))}
                </Container>
              );
            }
            if (value[0].type === "svg_element") {
              return renderSVGDocument(value);
            }
            if (value[0].type === "thread_message") {
              return <ThreadMessageList messages={value as Message[]} />;
            }
            if (value[0].type === "image") {
              return (
                <AssetGrid values={value} onOpenIndex={onDoubleClickAsset} />
              );
            }
            if (["audio", "video"].includes(value[0].type)) {
              const seen = new Map<string, number>();
              return (
                <Container>
                  {value.map((v: any) => (
                    <OutputRenderer
                      key={withOccurrenceSuffix(
                        stableKeyForOutputValue(v),
                        seen
                      )}
                      value={v}
                      showTextActions={showTextActions}
                    />
                  ))}
                </Container>
              );
            }
            const columnType = (
              v: any
            ): "string" | "float" | "int" | "datetime" | "object" => {
              if (typeof v === "string") {
                return "string";
              }
              if (typeof v === "number") {
                return "float";
              }
              return "object";
            };
            const df: DataframeRef = {
              type: "dataframe" as const,
              uri: "",
              data: value.map((v: any) => Object.values(v)),
              columns: Object.entries(value[0]).map((i) => ({
                name: i[0],
                data_type: columnType(i[1]),
                description: ""
              }))
            };
            return <DataframeRenderer dataframe={df} />;
          }
        }

        return (
          <Container>
            {(() => {
              const seen = new Map<string, number>();
              return value.map((v: any) => (
                <OutputRenderer
                  key={withOccurrenceSuffix(stableKeyForOutputValue(v), seen)}
                  value={v}
                  showTextActions={showTextActions}
                />
              ));
            })()}
          </Container>
        );
      case "segmentation_result":
        return (
          <div>
            {Object.entries(value).map((v: any) => (
              <OutputRenderer
                key={v[0]}
                value={v[1]}
                showTextActions={showTextActions}
              />
            ))}
          </div>
        );
      case "classification_result":
        return (
          <div>
            {value["label"]}: {value["score"]}
          </div>
        );
      case "svg_element":
        return renderSVGDocument(value);
      case "boolean": {
        return <BooleanRenderer value={value as boolean} />;
      }
      case "datetime": {
        return <DatetimeRenderer value={value as Datetime} />;
      }
      case "email":
        return <EmailRenderer value={value} />;
      case "chunk": {
        const chunk = value as Chunk;
        return <ChunkRenderer chunk={chunk} />;
      }
      case "json":
        return <JSONRenderer value={value} showActions={showTextActions} />;
      default:
        if (value !== null && typeof value === "object") {
          return <JSONRenderer value={value} showActions={showTextActions} />;
        }
        return (
          <TextRenderer
            text={value?.toString?.() ?? ""}
            showActions={showTextActions}
          />
        );
    }
  }, [
    value,
    type,
    onDoubleClickAsset,
    videoRef,
    handleMouseDown,
    scrollRef,
    showTextActions,
    handleModel3DClick
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
    <div style={{ height: "100%", width: "100%" }}>
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
