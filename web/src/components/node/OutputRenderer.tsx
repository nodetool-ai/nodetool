/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { Asset, DataframeRef, Message, Tensor } from "../../stores/ApiTypes";
import MarkdownRenderer from "../../utils/MarkdownRenderer";
import AudioPlayer from "../audio/AudioPlayer";
import DataTable from "./DataTable/DataTable";
import { useState } from "react";
import ThreadMessageList from "./ThreadMessageList";
// import ImageList from "./ImageList";
import { Button, ButtonGroup, Container } from "@mui/material";
import { useClipboard } from "../../hooks/browser/useClipboard";
import { useNotificationStore } from "../../stores/NotificationStore";
import ListTable from "./DataTable/ListTable";
import DictTable from "./DataTable/DictTable";
import TaskTable from "./DataTable/TaskTable";
import ImageView from "./ImageView";
import AssetGrid from "../assets/AssetGrid";
import AssetGridContent from "../assets/AssetGridContent";
import { uint8ArrayToDataUri } from "../../utils/binary";

interface SortedAssetsByType {
  assetsByType: Record<string, Asset[]>;
  totalCount: number;
}

export type OutputRendererProps = {
  value: any;
};

function generateAssetGridContent(value: any) {
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

  return (
    <AssetGridContent assets={assets} />
  );
}



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
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmaller,
      wordWrap: "break-word",
      overflowWrap: "break-word"
    },
    ul: {
      margin: "0",
      padding: ".1em 1.75em",
      listStyleType: "square",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmaller
    },
    li: {
      margin: "0",
      padding: ".1em .25em",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmaller
    },
    pre: {
      margin: "0",
      padding: ".25em",
      fontSize: theme.fontSizeSmaller,
      backgroundColor: theme.palette.c_gray0,
      width: "100%",
      overflowX: "scroll"
    },
    code: {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller
    },
    ".actions": {
      position: "absolute",
      right: "2.5em",
      top: "0px",
      padding: "0",
      margin: "0",
      display: "flex",
      flexDirection: "row",
      gap: "0.5em",
      zIndex: 1000
    },
    ".actions button": {
      padding: "0 .2em",
      minWidth: "unset",
      color: theme.palette.c_gray5,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller
    }
  });

const typeFor = (value: any): string => {
  if (value === undefined || value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (typeof value === "object" && "type" in value) {
    return value.type;
  }
  return typeof value;
};

const OutputRenderer: React.FC<OutputRendererProps> = ({ value }) => {
  const [openViewer, setOpenViewer] = useState(false);
  const { writeClipboard } = useClipboard();
  const type = typeFor(value);

  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const handleCopyToClipboard = (value: string) => {
    writeClipboard(value?.toString(), true);
    addNotification({
      type: "info",
      alert: true,
      content: "Value copied to Clipboard!"
    });
  };

  if (value === null || value === undefined) {
    return null;
  }

  function renderTensorPreview(tensor: Tensor): string {
    const value = tensor.value || [];
    const dtype = tensor.dtype || "unknown";
    const preview = `
    ${dtype}
    ${JSON.stringify(value, null, 2)}
  `;
    return preview;
  }

  switch (type) {
    case "image":
      return (
        <ImageView source={value?.uri === "" ? value?.data : value?.uri} />
      );
    case "audio":
      return (
        <div className="audio" style={{ padding: "1em" }}>
          <AudioPlayer source={value?.uri === "" ? value?.data : value?.uri} />
        </div>
      );
    case "video":
      if (value?.uri === "") {
        const blob = new Blob([value?.data], { type: "video/mp4" });
        const url = URL.createObjectURL(blob);
        return <video src={url} controls style={{ width: "100%" }} />;
      } else {
        return <video src={value?.uri} controls style={{ width: "100%" }} />;
      }
    case "dataframe":
      return <DataTable dataframe={value as DataframeRef} editable={false} />;
    case "tensor":
      return (
        <div className="tensor nodrag nowheel">
          {renderTensorPreview(value)}
        </div>
      );
    case "object":
      if (Object.values(value).length === 0) {
        const val = Object.values(value);
        if (typeof val[0] === "string") {
          return <DictTable data={value} data_type="string" editable={false} />;
        }
        if (typeof val[0] === "number") {
          return <DictTable data={value} data_type="float" editable={false} />;
        }
      }
      return <DictTable data={value} editable={false} data_type="string" />;
    case "array":
      if (value.length > 0) {
        if (typeof value[0] === "string") {
          return <ListTable data={value} data_type="string" editable={false} />;
        }
        if (typeof value[0] === "number") {
          return <ListTable data={value} data_type="float" editable={false} />;
        }
        if (typeof value[0] === "object") {
          if (value[0].type === "thread_message") {
            return <ThreadMessageList messages={value as Message[]} />;
          }
          if (value[0].type === "task") {
            return <TaskTable data={value} />;
          }
          if (["image", "audio", "video"].includes(value[0].type)) {
            return generateAssetGridContent(value);
          }
          const columnType = (v: any): "string" | "float" | "object" => {
            if (typeof v === "string") {
              return "string";
            }
            if (typeof v === "number") {
              return "float";
            }
            return "object";
          }
          const df = {
            data: value.map((v: any) => Object.values(v)),
            columns: Object.entries(value[0]).map(i => {
              return { name: i[0], data_type: columnType(i[1]) };
            })
          };
          console.log(df);
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
    default:
      return (
        <div className="output value nodrag nowheel" css={styles}>
          {value !== null && (
            <>
              <ButtonGroup className="actions">
                <Button
                  size="small"
                  onClick={() => handleCopyToClipboard(value?.toString())}
                >
                  Copy
                </Button>
              </ButtonGroup>
              <MarkdownRenderer content={value?.toString()} />
            </>
          )}
        </div>
      );
  }
};

export default OutputRenderer;