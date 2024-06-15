/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { DataframeRef, Message, Tensor } from "../../stores/ApiTypes";
import MarkdownRenderer from "../../utils/MarkdownRenderer";
import AudioPlayer from "../audio/AudioPlayer";
import DataTable from "./DataTable/DataTable";
import AssetViewer from "../assets/AssetViewer";
import { useState } from "react";
import ThreadMessageList from "./ThreadMessageList";
import ImageList from "./ImageList";
import { Button, ButtonGroup, Container, Typography } from "@mui/material";
import { useClipboard } from "../../hooks/browser/useClipboard";
import { useNotificationStore } from "../../stores/NotificationStore";
import ListTable from "./DataTable/ListTable";
import DictTable from "./DataTable/DictTable";

export type OutputRendererProps = {
  value: any;
};

const styles = (theme: any) =>
  css({
    "&": {
      backgroundColor: theme.palette.c_gray2,
      maxHeight: "200px",
      padding: ".25em",
      overflow: "hidden auto",
      userSelect: "text",
      cursor: "text"
    },
    p: {
      margin: "0",
      padding: ".25em",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmaller
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
      right: "1em",
      top: "-20px",
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
      fontSize: theme.fontSizeSmaller
    }
  });

const typeFor = (value: any): string => {
  if (value === undefined || value === null) {
    return "null";
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
      return value?.uri ? (
        <div
          className="image-output"
          style={{
            position: "relative",
            display: "flex",
            justifyContent: "flex-start",
            alignItems: "flex-start",
            width: "100%",
            height: "100%",
            minHeight: "50px"
          }}
        >
          <AssetViewer
            contentType="image/*"
            url={value.uri}
            open={openViewer}
            onClose={() => setOpenViewer(false)}
          />
          <div
            style={{
              position: "absolute",
              backgroundImage: `url(${value.uri})`,
              backgroundSize: "contain",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
              width: "100%",
              height: "100%",
              minHeight: "20px"
            }}
            onDoubleClick={() => setOpenViewer(true)}
          />
        </div>
      ) : (
        <Typography> No Image found </Typography>
      );
    case "audio":
      return (
        <div className="audio" style={{ padding: "1em" }}>
          <AudioPlayer url={value?.uri} />
        </div>
      );
    case "video":
      return <video src={value?.uri} controls style={{ width: "100%" }} />;
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
          if (value[0].type === "image") {
            return <ImageList images={value} />;
          }
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
