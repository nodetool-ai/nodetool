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
  Message,
  NPArray,
  TaskPlan,
  PlotlyConfig,
  Task
} from "../../stores/ApiTypes";
import AudioPlayer from "../audio/AudioPlayer";
import DataTable from "./DataTable/DataTable";
import ThreadMessageList from "./ThreadMessageList";
import { Container, List, ListItem, ListItemText } from "@mui/material";
import ListTable from "./DataTable/ListTable";
import DictTable from "./DataTable/DictTable";
import ImageView from "./ImageView";
import AssetViewer from "../assets/AssetViewer";
import TaskPlanView from "./TaskPlanView";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { isEqual } from "lodash";
import { Chunk } from "../../stores/ApiTypes";
import TaskView from "./TaskView";
import {
  typeFor,
  renderSVGDocument,
  useCopyToClipboard,
  useImageAssets,
  useRevokeBlobUrls,
  useVideoSrc
} from "./output";
import { TextRenderer } from "./output/TextRenderer";
import { BooleanRenderer } from "./output/BooleanRenderer";
import { EmailRenderer } from "./output/EmailRenderer";
import { ArrayRenderer } from "./output/ArrayRenderer";
import { AssetGrid } from "./output/AssetGrid";
import { ChunkRenderer } from "./output/ChunkRenderer";
import { RealtimeAudioOutput } from "./output";
// import left for future reuse of audio stream component when needed

// Custom hook for draggable scrolling
const useDraggableScroll = () => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const scrollTop = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    isDragging.current = true;
    startY.current = e.clientY;
    scrollTop.current = scrollRef.current.scrollTop;
    scrollRef.current.style.cursor = "grabbing";
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    e.preventDefault();
    const deltaY = e.clientY - startY.current;
    scrollRef.current.scrollTop = scrollTop.current - deltaY;
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!scrollRef.current) return;
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
};

// all helpers/styles/hooks moved to ./output/*

const OutputRenderer: React.FC<OutputRendererProps> = ({ value }) => {
  const shouldRender = !(
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0)
  );

  const copyToClipboard = useCopyToClipboard();
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
          <div style={{ width: "100%", height: "400px" }}>
            <Plot
              data={config.config.data as Plotly.Data[]}
              layout={config.config.layout as Partial<Plotly.Layout>}
              config={config.config.config as Partial<Plotly.Config>}
              frames={config.config.frames as Plotly.Frame[] | undefined}
              style={{ width: "100%", height: "100%" }}
            />
          </div>
        );
      case "image":
        if (Array.isArray(value.data)) {
          return value.data.map((v: any, i: number) => (
            <ImageView key={i} source={v} />
          ));
        } else {
          return <ImageView source={value?.uri ? value?.uri : value?.data} />;
        }
      case "audio":
        return (
          <div className="audio" style={{ padding: "1em" }}>
            <AudioPlayer
              source={value?.uri === "" ? value?.data : value?.uri}
            />
          </div>
        );
      case "video":
        return <video ref={videoRef} controls style={{ width: "100%" }} />;
      case "dataframe":
        return <DataTable dataframe={value as DataframeRef} editable={false} />;
      case "np_array":
        return (
          <div className="tensor nodrag">
            <ArrayRenderer array={value as NPArray} />
          </div>
        );
      case "object":
        if (Object.values(value).length === 0) {
          const val = Object.values(value);
          if (typeof val[0] === "string") {
            return (
              <DictTable data={value} data_type="string" editable={false} />
            );
          }
          if (typeof val[0] === "number") {
            return (
              <DictTable data={value} data_type="float" editable={false} />
            );
          }
        }
        return <DictTable data={value} editable={false} data_type="string" />;
      case "task":
        return <TaskView task={value as Task} />;
      case "task_plan":
        return <TaskPlanView data={value as TaskPlan} />;
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
                  maxHeight: 360,
                  overflow: "hidden",
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
                const text = chunks
                  .filter((c) => !!c)
                  .map((c) => c.content)
                  .join("");
                return <TextRenderer text={text} onCopy={copyToClipboard} />;
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
                    <OutputRenderer key={i} value={c} />
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
                    <OutputRenderer key={i} value={v} />
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
              <OutputRenderer key={i} value={v} />
            ))}
          </Container>
        );
      case "segmentation_result":
        return (
          <div>
            {Object.entries(value).map((v: any) => (
              <OutputRenderer key={v[0]} value={v[1]} />
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
        return (
          <BooleanRenderer value={value as boolean} onCopy={copyToClipboard} />
        );
      }
      case "email":
        return <EmailRenderer value={value} />;
      case "chunk": {
        const chunk = value as Chunk;
        return <ChunkRenderer chunk={chunk} onCopy={copyToClipboard} />;
      }
      default:
        return (
          <TextRenderer
            text={value?.toString?.() ?? ""}
            onCopy={copyToClipboard}
          />
        );
    }
  }, [
    value,
    type,
    onDoubleClickAsset,
    copyToClipboard,
    videoRef,
    handleMouseDown,
    scrollRef
  ]);

  if (!shouldRender) {
    return null;
  }

  return (
    <div className="nodrag">
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
