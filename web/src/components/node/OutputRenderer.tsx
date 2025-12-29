/** @jsxImportSource @emotion/react */
import React, {
  useMemo,
  useCallback,
  memo,
  useState,
  useRef,
  useEffect
} from "react";
import Plot from "react-plotly.js";

import {
  Asset,
  DataframeRef,
  Datetime,
  Message,
  NPArray,
  TaskPlan,
  PlotlyConfig,
  Task,
  CalendarEvent
} from "../../stores/ApiTypes";
import AudioPlayer from "../audio/AudioPlayer";
import DataTable from "./DataTable/DataTable";
import ThreadMessageList from "./ThreadMessageList";
import CalendarEventView from "./CalendarEventView";
import { Container, List, ListItem, ListItemText } from "@mui/material";
import ListTable from "./DataTable/ListTable";
import DictTable from "./DataTable/DictTable";
import ImageView from "./ImageView";
import AssetViewer from "../assets/AssetViewer";
import TaskPlanView from "./TaskPlanView";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import isEqual from "lodash/isEqual";
import { Chunk } from "../../stores/ApiTypes";
import TaskView from "./TaskView";
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
import { RealtimeAudioOutput } from "./output";
// import left for future reuse of audio stream component when needed

// Keep this large for UX (big LLM outputs), but bounded to avoid browser OOM /
// `RangeError: Invalid string length` when streams run away.
const MAX_RENDERED_TEXT_CHARS = 5_000_000;

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

  const videoRef = useVideoSrc(type === "video" ? value : undefined);

  const renderContent = useMemo(() => {
    let config: PlotlyConfig | undefined;
    switch (type) {
      case "plotly_config":
        config = value as PlotlyConfig;
        return (
          <div
            className="render-content"
            style={{ width: "100%", height: "100%" }}
          >
            <Plot
              data={config.config.data as Plotly.Data[]}
              layout={config.config.layout as Partial<Plotly.Layout>}
              config={config.config.config as Partial<Plotly.Config>}
              frames={config.config.frames as Plotly.Frame[] | undefined}
              style={{ width: "100%", height: "100%" }}
            />
          </div>
        );
      case "image_comparison":
        return <ImageComparisonRenderer value={value} />;
      case "image":
        if (Array.isArray(value.data)) {
          return value.data.map((v: any, i: number) => (
            <ImageView key={i} source={v} />
          ));
        } else {
          return <ImageView source={value?.uri ? value?.uri : value?.data} />;
        }
      case "audio": {
        // Handle different audio data formats
        let audioSource: string | Uint8Array;

        if (value?.uri && value.uri !== "") {
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

        return (
          <div className="audio" style={{ padding: "1em" }}>
            <AudioPlayer source={audioSource} />
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
      case "dataframe":
        return <DataTable dataframe={value as DataframeRef} editable={false} />;
      case "np_array":
        return (
          <div className="tensor nodrag">
            <ArrayRenderer array={value as NPArray} />
          </div>
        );
      case "object": {
        const vals = Object.values(value);
        // Check if any values are nested objects/arrays - use JSON renderer for complex structures
        const hasNestedObjects = vals.some(
          (v) => v !== null && typeof v === "object"
        );
        if (hasNestedObjects) {
          return <JSONRenderer value={value} showActions={showTextActions} />;
        }
        // Simple key-value pairs - use DictTable
        if (vals.length > 0) {
          if (typeof vals[0] === "string") {
            return (
              <DictTable data={value} data_type="string" editable={false} />
            );
          }
          if (typeof vals[0] === "number") {
            return (
              <DictTable data={value} data_type="float" editable={false} />
            );
          }
        }
        return <DictTable data={value} editable={false} data_type="string" />;
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
                  {value.map((v: any, i: number) => (
                    <ListItem
                      key={i}
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
                return (
                  <RealtimeAudioOutput
                    chunks={audioChunks}
                    sampleRate={22000}
                    channels={1}
                  />
                );
              }
              // Mixed or non-text chunks: render each chunk individually
              return (
                <Container>
                  {chunks.map((c, i) => (
                    <OutputRenderer
                      key={i}
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
              return (
                <Container>
                  {value.map((v: any, i: number) => (
                    <OutputRenderer
                      key={i}
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
            return <DataTable dataframe={df} editable={false} />;
          }
        }

        return (
          <Container>
            {value.map((v: any, i: number) => (
              <OutputRenderer
                key={i}
                value={v}
                showTextActions={showTextActions}
              />
            ))}
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
    showTextActions
  ]);

  if (!shouldRender) {
    return null;
  }

  return (
    <div className="nodrag" style={{ height: "100%", width: "100%" }}>
      {openAsset && (
        <AssetViewer
          asset={openAsset}
          sortedAssets={
            computedViewer.assets.length ? computedViewer.assets : undefined
          }
          open={openAsset !== null}
          onClose={() => setLocalOpenAsset(null)}
        />
      )}
      {renderContent}
    </div>
  );
};

export default memo(OutputRenderer, isEqual);
