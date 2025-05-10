/** @jsxImportSource @emotion/react */
import React, {
  useMemo,
  useCallback,
  useRef,
  useEffect,
  memo,
  createElement
} from "react";
import { css } from "@emotion/react";
import Plot from "react-plotly.js";

import {
  Asset,
  DataframeRef,
  Message,
  NPArray,
  Task,
  TaskPlan,
  PlotlyConfig
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
import AssetGridContent from "../assets/AssetGridContent";
import { uint8ArrayToDataUri } from "../../utils/binary";
import ArrayView from "./ArrayView"; // We'll create this component
import TaskPlanView from "./TaskPlanView";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { isEqual } from "lodash";
import { SVGElement } from "../../stores/ApiTypes";
import { console } from "node:inspector/promises";
export type OutputRendererProps = {
  value: any;
};

function generateAssetGridContent(
  value: Asset[],
  onDoubleClick: (asset: Asset) => void
) {
  const assets: Asset[] = value.map((item: any, index: number) => {
    let contentType: string;
    let name: string;
    switch (item.type) {
      case "image":
        contentType = "image/png";
        name = item.name || `Image ${index + 1}.png`;
        break;
      case "audio":
        contentType = "audio/mp3";
        name = item.name || `Audio ${index + 1}.mp3`;
        break;
      case "video":
        contentType = "video/mp4";
        name = item.name || `Video ${index + 1}.mp4`;
        break;
      default:
        contentType = "application/octet-stream";
        name = item.name || `File ${index + 1}`;
    }

    const get_url = item.uri || uint8ArrayToDataUri(item.data, contentType);
    const thumb_url = item.thumb_url || get_url;

    return {
      id: item.id || `output-${item.type}-${index}`,
      user_id: "",
      workflow_id: null,
      parent_id: "",
      name: name,
      content_type: contentType,
      metadata: {},
      created_at: new Date().toISOString(),
      get_url: get_url,
      thumb_url: thumb_url,
      duration: item.duration || null
    } as Asset;
  });

  return <AssetGridContent assets={assets} onDoubleClick={onDoubleClick} />;
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

const styles = (theme: any) =>
  css({
    "&": {
      backgroundColor: theme.palette.c_gray2,
      height: "100%",
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
      backgroundColor: theme.palette.c_gray0,
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
      color: theme.palette.c_gray5,
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
  const { writeClipboard } = useClipboard();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const setOpenAsset = useAssetGridStore((state) => state.setOpenAsset);

  const type = useMemo(() => typeFor(value), [value]);

  const onDoubleClickAsset = useCallback(
    (asset: Asset) => {
      setOpenAsset(asset);
    },
    [setOpenAsset]
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
              data={config.config.data}
              layout={config.config.layout}
              config={config.config.config}
              frames={config.config.frames}
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
          return (
            <ImageView source={value?.uri === "" ? value?.data : value?.uri} />
          );
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
      case "task_plan":
        return <TaskPlanView data={value as TaskPlan} />;
      case "array":
        if (value.length > 0) {
          if (value[0] === undefined || value[0] === null) {
            return <div>Array is empty</div>;
          }
          if (typeof value[0] === "string") {
            return (
              <MarkdownRenderer
                content={value.map((v: any) => v.toString()).join("")}
              />
            );
          }
          if (typeof value[0] === "number") {
            return (
              <ListTable data={value} data_type="float" editable={false} />
            );
          }
          if (typeof value[0] === "object") {
            if (value[0].type === "svg_element") {
              return renderSVGDocument(value);
            }
            if (value[0].type === "thread_message") {
              return <ThreadMessageList messages={value as Message[]} />;
            }
            if (["image", "audio", "video"].includes(value[0].type)) {
              return generateAssetGridContent(value, onDoubleClickAsset);
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
          <div className="output value nodrag" css={styles}>
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
          <div css={styles}>
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
            <div className="email-body">
              <MarkdownRenderer content={value.body} />
            </div>
          </div>
        );
      default:
        return (
          <div className="output value nodrag" css={styles}>
            {value !== null && (
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
                <MarkdownRenderer content={value?.toString()} />
              </>
            )}
          </div>
        );
    }
  }, [value, type, onDoubleClickAsset, handleCopyToClipboard]);

  return renderContent;
};

export default memo(OutputRenderer, isEqual);
