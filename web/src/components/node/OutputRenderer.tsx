/** @jsxImportSource @emotion/react */
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import React, {
  useMemo,
  useCallback,
  useRef,
  useEffect,
  memo,
  createElement,
  useState
} from "react";
import { css } from "@emotion/react";
import Plot from "react-plotly.js";

import {
  Asset,
  DataframeRef,
  Message,
  NPArray,
  TaskPlan,
  PlotlyConfig,
  AssetRef,
  Task
} from "../../stores/ApiTypes";
import MarkdownRenderer from "../../utils/MarkdownRenderer";
import AudioPlayer from "../audio/AudioPlayer";
import DataTable from "./DataTable/DataTable";
import ThreadMessageList from "./ThreadMessageList";
import { Button, ButtonGroup, Container, Tooltip } from "@mui/material";
import { useClipboard } from "../../hooks/browser/useClipboard";
import { useNotificationStore } from "../../stores/NotificationStore";
import ListTable from "./DataTable/ListTable";
import DictTable from "./DataTable/DictTable";
import ImageView from "./ImageView";
import PreviewImageGrid from "./PreviewImageGrid";
import AssetViewer from "../assets/AssetViewer";
import ArrayView from "./ArrayView"; // We'll create this component
import TaskPlanView from "./TaskPlanView";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { isEqual } from "lodash";
import { SVGElement, Chunk } from "../../stores/ApiTypes";
import TaskView from "./TaskView";
export type OutputRendererProps = {
  value: any;
};

// Shared Web Audio context and scheduler for streaming PCM16 audio chunks
let sharedAudioContext: AudioContext | null = null;
let sharedNextStartTime = 0;

function getAudioContext(): AudioContext {
  if (typeof window === "undefined") throw new Error("No window");
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (!sharedAudioContext) {
    sharedAudioContext = new Ctx();
  }
  return sharedAudioContext;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const cleaned = (base64 || "")
    .replace(/^data:[^;]*;base64,/, "")
    .replace(/\s/g, "");
  const binaryString = atob(cleaned);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

function int16ToFloat32(int16Array: Int16Array): Float32Array {
  const float32 = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    const s = int16Array[i];
    float32[i] = s < 0 ? s / 32768 : s / 32767;
  }
  return float32;
}

function playPcm16Base64(
  base64: string,
  opts?: { sampleRate?: number; channels?: number }
) {
  const sampleRate = opts?.sampleRate ?? 22000;
  const channels = opts?.channels ?? 1;

  const ctx = getAudioContext();
  ctx.resume().catch(() => {});

  const u8 = base64ToUint8Array(base64);
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const frameCount = Math.floor(u8.byteLength / 2 / channels);
  const buffer = ctx.createBuffer(channels, frameCount, sampleRate);

  for (let ch = 0; ch < channels; ch++) {
    const channelData = new Int16Array(frameCount);
    let srcIndex = ch * 2;
    for (let i = 0; i < frameCount; i++) {
      const sample = view.getInt16(srcIndex, true);
      channelData[i] = sample;
      srcIndex += channels * 2;
    }
    const floatData = int16ToFloat32(channelData);
    buffer.copyToChannel(floatData, ch);
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);

  const startTime = Math.max(sharedNextStartTime, ctx.currentTime);
  try {
    source.start(startTime);
    sharedNextStartTime = startTime + buffer.duration;
  } catch {
    source.start();
    sharedNextStartTime = ctx.currentTime + buffer.duration;
  }
  source.onended = () => {
    source.disconnect();
  };
}

const StreamPcm16Player: React.FC<{
  base64: string;
  sampleRate?: number;
  channels?: number;
}> = ({ base64, sampleRate = 16000, channels = 1 }) => {
  const lastPlayedRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      typeof base64 === "string" &&
      base64 &&
      base64 !== lastPlayedRef.current
    ) {
      try {
        playPcm16Base64(base64, { sampleRate, channels });
      } catch (e) {
        console.error("PCM16 chunk playback failed", e);
      }
      lastPlayedRef.current = base64;
    }
  }, [base64, sampleRate, channels]);
  return null;
};

// Heuristic to detect if a string likely contains Markdown
const isLikelyMarkdown = (text: string): boolean => {
  if (!text) return false;
  // Quick rejects: very short strings or strings without markdown-y chars
  if (text.length < 6) return false;

  // Common Markdown patterns
  const patterns = [
    /(^|\n)\s{0,3}#{1,6}\s+\S/, // headings
    /(^|\n)```/, // fenced code blocks
    /(^|\n)\s{0,3}[-*+]\s+\S/, // unordered list
    /(^|\n)\s{0,3}\d+\.\s+\S/, // ordered list
    /\[[^\]]+\]\([^)]+\)/, // links
    /!\[[^\]]*\]\([^)]+\)/, // images
    /(^|\n)\s{0,3}>\s+\S/, // blockquote
    /(^|\n)\|[^\n]*\|/, // tables with pipes
    /`[^`]+`/, // inline code
    /(^|\n)\s*([-*_]\s*){3,}\s*(\n|$)/, // hr --- *** ___
    /\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_/ // emphasis
  ];

  return patterns.some((re) => re.test(text));
};

// Render text as Markdown when appropriate, else as plain text
const renderMaybeMarkdown = (text: string): React.ReactNode =>
  isLikelyMarkdown(text) ? (
    <MarkdownRenderer content={text} />
  ) : (
    <div style={{ padding: "1em", whiteSpace: "pre-wrap" }}>{text}</div>
  );

function generateAssetGridContent(
  value: AssetRef[],
  onOpenIndex: (index: number) => void
) {
  // Filter to images and pass raw data or URI directly without base64 conversion
  const images = value
    .filter((item) => item && item.type === "image")
    .map((item) =>
      (item as any).uri ? (item as any).uri : ((item as any).data as Uint8Array)
    );

  return <PreviewImageGrid images={images} onDoubleClick={onOpenIndex} />;
}

const convertStyleStringToObject = (
  styleString: string
): React.CSSProperties => {
  if (!styleString) return {};
  return styleString
    .split(";")
    .filter((style) => style.trim())
    .reduce((acc, style) => {
      const [property, value] = style.split(":").map((str) => str.trim());
      // Convert kebab-case to camelCase
      const camelProperty = property.replace(/-([a-z])/g, (g) =>
        g[1].toUpperCase()
      );
      return { ...acc, [camelProperty]: value };
    }, {});
};

const renderSvgElement = (value: SVGElement): React.ReactElement => {
  const attributes = value.attributes || {};

  // Convert style string to object if present
  const style = attributes.style
    ? convertStyleStringToObject(attributes.style)
    : undefined;

  // Create props object from attributes
  const svgProps = {
    ...value.attributes,
    // Ensure React-compatible attribute names
    className: attributes.class,
    xmlSpace: attributes["xml:space"],
    xmlLang: attributes["xml:lang"],
    style // Override style with converted object
  };

  // Handle children differently based on type
  const children = [
    // Add text/SVG content if present
    value.content &&
      (typeof value.content === "string" &&
      value.content.trim().startsWith("<") ? (
        <div dangerouslySetInnerHTML={{ __html: value.content }} />
      ) : (
        value.content
      )),
    // Render child SVG elements
    ...(value.children || []).map(renderSvgElement)
  ].filter(Boolean);

  return createElement(value.name || "svg", svgProps, ...children);
};

const renderSVGDocument = (value: SVGElement[]): React.ReactElement => {
  const docAttributes = {
    xmlns: "http://www.w3.org/2000/svg",
    version: "1.1",
    width: "100%",
    height: "100%"
  };

  // Extract actual SVG content from nested structure
  const extractSVGContent = (elements: SVGElement[]): React.ReactElement[] => {
    return elements.map((element) => {
      if (element.content && typeof element.content === "string") {
        // Extract the inner SVG content using regex
        const match = element.content.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
        if (match && match[1]) {
          // Return just the inner content
          return (
            <g
              key={element.name}
              dangerouslySetInnerHTML={{ __html: match[1] }}
            />
          );
        }
      }
      return renderSvgElement(element);
    });
  };

  const children = extractSVGContent(value);
  return createElement("svg", docAttributes, ...children);
};

const styles = (theme: Theme) =>
  css({
    "&": {
      backgroundColor: "transparent",
      height: "calc(100% - 43px)",
      width: "100%",
      padding: ".25em",
      overflow: "auto",
      userSelect: "text",
      cursor: "text"
    },
    ".content": {
      flex: 1,
      overflowY: "auto",
      overflowX: "hidden"
    },
    p: {
      margin: "0",
      padding: ".25em",
      wordWrap: "break-word",
      overflowWrap: "break-word"
    },
    ul: {
      margin: "0",
      padding: ".1em 1.75em",
      listStyleType: "square"
    },
    li: {
      margin: "0",
      padding: ".1em .25em"
    },
    pre: {
      margin: "0",
      padding: ".25em",
      backgroundColor: theme.vars.palette.grey[900],
      width: "100%",
      overflowX: "scroll"
    },
    code: {
      fontFamily: theme.fontFamily2
    },
    ".actions": {
      position: "absolute",
      maxWidth: "50%",
      left: "5.5em",
      bottom: ".1em",
      top: "unset",
      padding: "0",
      margin: "0",
      display: "flex",
      flexDirection: "row",
      gap: "0.5em",
      zIndex: 10
    },
    ".actions button": {
      minWidth: "unset",
      width: "auto",
      lineHeight: "1.5em",
      padding: ".3em .3em 0 .3em",
      color: theme.vars.palette.grey[200],
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall
    }
  });

const typeFor = (value: any): string => {
  if (value === undefined || value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "object" && "type" in value) {
    return value.type;
  }
  return typeof value;
};

const OutputRenderer: React.FC<OutputRendererProps> = ({ value }) => {
  const theme = useTheme();
  const shouldRender = !(
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0)
  );

  const { writeClipboard } = useClipboard();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const setOpenAsset = useAssetGridStore((state) => state.setOpenAsset);
  const [openAsset, setLocalOpenAsset] = useState<Asset | null>(null);

  const type = useMemo(() => typeFor(value), [value]);

  // Prepare viewer assets and manage object URLs for image arrays
  const computedViewer = useMemo(() => {
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      value[0]?.type !== "image"
    ) {
      return { assets: [] as Asset[], urls: [] as string[] };
    }
    const urls: string[] = [];
    const assets: Asset[] = (value as AssetRef[]).map(
      (item: AssetRef, index: number) => {
        const contentType = "image/png";
        let url = "";
        if ((item as any).uri) {
          url = (item as any).uri as string;
        } else if ((item as any).data) {
          try {
            const blob = new Blob([(item as any).data as Uint8Array], {
              type: contentType
            });
            url = URL.createObjectURL(blob);
            urls.push(url);
          } catch {
            url = "";
          }
        }
        return {
          id: (item as any).id || `output-image-${index}`,
          user_id: "",
          workflow_id: null,
          parent_id: "",
          name: (item as any).name || `Image ${index + 1}.png`,
          content_type: contentType,
          metadata: {},
          created_at: new Date().toISOString(),
          get_url: url,
          thumb_url: url,
          duration: null
        } as Asset;
      }
    );
    return { assets, urls };
  }, [value]);

  useEffect(() => {
    const urls = computedViewer.urls;
    return () => {
      urls.forEach((u) => {
        try {
          if (u && u.startsWith("blob:")) URL.revokeObjectURL(u);
        } catch {
          console.error("Error revoking blob URL", u);
        }
      });
    };
  }, [computedViewer.urls]);

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

  const handleCopyToClipboard = useCallback(
    (value: string) => {
      writeClipboard(value?.toString(), true);
      addNotification({
        type: "info",
        alert: true,
        content: "Value copied to Clipboard!"
      });
    },
    [writeClipboard, addNotification]
  );

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (type === "video" && videoRef.current) {
      if (value?.uri === "") {
        const blob = new Blob([value?.data], { type: "video/mp4" });
        const url = URL.createObjectURL(blob);
        videoRef.current.src = url;
        return () => URL.revokeObjectURL(url);
      } else {
        videoRef.current.src = value?.uri;
      }
    }
  }, [type, value]);

  const renderContent = useMemo(() => {
    function renderArrayPreview(array: NPArray): React.ReactNode {
      return <ArrayView array={array} />;
    }

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
            {renderArrayPreview(value as NPArray)}
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
                style={{
                  padding: "0.5em"
                }}
              >
                {value.map((v: any) => (
                  <div key={v}>{v}</div>
                ))}
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
                return (
                  <div
                    className="output value nodrag noscroll"
                    css={styles(theme)}
                  >
                    {text !== "" && (
                      <>
                        <ButtonGroup className="actions">
                          <Tooltip
                            title="Copy to Clipboard"
                            enterDelay={TOOLTIP_ENTER_DELAY}
                          >
                            <Button
                              size="small"
                              onClick={() => handleCopyToClipboard(text)}
                            >
                              Copy
                            </Button>
                          </Tooltip>
                        </ButtonGroup>
                        {renderMaybeMarkdown(text)}
                      </>
                    )}
                  </div>
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
              return generateAssetGridContent(value, onDoubleClickAsset);
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
        const boolStr = String(value).toUpperCase();
        return (
          <div className="output value nodrag noscroll" css={styles(theme)}>
            <ButtonGroup className="actions">
              <Tooltip
                title="Copy to Clipboard"
                enterDelay={TOOLTIP_ENTER_DELAY}
              >
                <Button
                  size="small"
                  onClick={() => handleCopyToClipboard(boolStr)}
                >
                  Copy
                </Button>
              </Tooltip>
            </ButtonGroup>
            <p style={{ padding: "1em", color: "inherit" }}>{boolStr}</p>
          </div>
        );
      }
      case "email":
        return (
          <div css={styles(theme)}>
            <div className="email-header">
              <p>
                <strong>From:</strong> {value.sender}
              </p>
              <p>
                <strong>To:</strong> {value.to}
              </p>
              {value.cc && (
                <p>
                  <strong>CC:</strong> {value.cc}
                </p>
              )}
              <p>
                <strong>Subject:</strong> {value.subject}
              </p>
            </div>
            <div className="email-body">{renderMaybeMarkdown(value.body)}</div>
          </div>
        );
      case "chunk": {
        const chunk = value as Chunk;
        switch (chunk.content_type) {
          case "image":
            return <ImageView source={chunk.content} />;
          case "audio":
            // Otherwise assume base64 PCM16 16k and stream via Web Audio without UI
            return (
              <StreamPcm16Player
                base64={chunk.content as string}
                sampleRate={22000}
                channels={1}
              />
            );
          case "video":
            return (
              <video src={chunk.content} controls style={{ width: "100%" }} />
            );
          case "document":
            return (
              <div className="output value nodrag noscroll" css={styles(theme)}>
                <a href={chunk.content} target="_blank" rel="noreferrer">
                  Open document
                </a>
              </div>
            );
          case "text":
          default: {
            const text = chunk.content ?? "";
            return (
              <div className="output value nodrag noscroll" css={styles(theme)}>
                {text !== "" && (
                  <>
                    <ButtonGroup className="actions">
                      <Tooltip
                        title="Copy to Clipboard"
                        enterDelay={TOOLTIP_ENTER_DELAY}
                      >
                        <Button
                          size="small"
                          onClick={() => handleCopyToClipboard(text)}
                        >
                          Copy
                        </Button>
                      </Tooltip>
                    </ButtonGroup>
                    {renderMaybeMarkdown(text)}
                  </>
                )}
              </div>
            );
          }
        }
      }
      default:
        return (
          <div className="output value nodrag noscroll" css={styles(theme)}>
            {value !== null &&
              value !== undefined &&
              value.toString() !== "" && (
                <>
                  <ButtonGroup className="actions">
                    <Tooltip
                      title="Copy to Clipboard"
                      enterDelay={TOOLTIP_ENTER_DELAY}
                    >
                      <Button
                        size="small"
                        onClick={() => handleCopyToClipboard(value?.toString())}
                      >
                        Copy
                      </Button>
                    </Tooltip>
                  </ButtonGroup>
                  {renderMaybeMarkdown(value?.toString())}
                </>
              )}
          </div>
        );
    }
  }, [
    value,
    type,
    onDoubleClickAsset,
    handleCopyToClipboard,
    theme
  ]);

  if (!shouldRender) {
    return null;
  }

  return (
    <>
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
    </>
  );
};

export default memo(OutputRenderer, isEqual);
