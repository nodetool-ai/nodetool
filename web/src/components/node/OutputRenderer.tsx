/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { DataFrame, ThreadMessage, TypeMetadata } from "../../stores/ApiTypes";
import MarkdownRenderer from "../../utils/MarkdownRenderer";
import AudioPlayer from "../audio/AudioPlayer";
import DataTable from "./DataTable";
import DictTable from "./DictTable";
import AssetViewer from "../assets/AssetViewer";
import { useState } from "react";
import reduceUnionType from "../../hooks/reduceUnionType";
import ThreadMessageList from "./ThreadMessageList";
import ImageList from "./ImageList";
import { Button, ButtonGroup, Typography } from "@mui/material";
import { useClipboard } from "../../hooks/browser/useClipboard";
import { useNotificationStore } from "../../stores/NotificationStore";
import { MIN_ZOOM } from "../../config/constants";
import { useStore } from "reactflow";
export type OutputRendererForTypeProps = {
  value: any;
  type: string;
};

export type OutputRendererProps = {
  value: any;
  type: TypeMetadata;
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

export const OutputRendererForType: React.FC<OutputRendererForTypeProps> = ({
  value,
  type
}) => {
  const [openViewer, setOpenViewer] = useState(false);
  const { writeClipboard } = useClipboard();

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

  if (
    value === null ||
    value === undefined ||
    Object.keys(value).length === 0
  ) {
    return null;
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
      return <DataTable data={value as DataFrame} />;
    case "object":
      return <DictTable data={value} />;
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

export const typeFor = (value: any): string => {
  if (typeof value === "object" && "type" in value) {
    return value.type;
  } else {
    return typeof value;
  }
};

const OutputRenderer: React.FC<OutputRendererProps> = ({ value, type }) => {
  const currentZoom = useStore((state) => state.transform[2]);
  const isMinZoom = currentZoom === MIN_ZOOM;

  if (value === null || value === undefined) {
    return null;
  }
  if (!isMinZoom) {
    if (type.type === "union") {
      const reducedType = reduceUnionType(type);
      return <OutputRendererForType value={value} type={reducedType} />;
    } else if (type.type === "list") {
      const type_args = type?.type_args;

      if (type_args === undefined || type_args.length === 0) {
        throw new Error("List type must have type arguments");
      }

      switch (type_args[0].type) {
        case "thread_message":
          return <ThreadMessageList messages={value as ThreadMessage[]} />;
        case "image":
          return <ImageList images={value} />;
        default:
          return value.map((v: any, i: number) => (
            <OutputRendererForType key={i} value={v} type={typeFor(v)} />
          ));
      }
    } else {
      return <OutputRendererForType value={value} type={type.type} />;
    }
  } else {
    <div className="property-spacer" style={{ height: "20px" }}></div>;
  }
};

export default OutputRenderer;
