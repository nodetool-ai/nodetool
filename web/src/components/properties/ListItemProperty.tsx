import { Typography } from "@mui/material";
import AudioPlayer from "../audio/AudioPlayer";
import DataTable from "../node/DataTable";
import DictTable from "../node/DictTable";
import { DataFrame, TypeMetadata } from "../../stores/ApiTypes";
import ThemeNodetool from "../themes/ThemeNodetool";
import MarkdownRenderer from "../../utils/MarkdownRenderer";

export type EdgeProps = {
  id: string;
  // name: string;
  type: TypeMetadata;
  value?: any;
};

/**
 * Renders one item of a list property.
 */
const ListItemProperty = ({ id, type, value }: EdgeProps) => {
  switch (type.type) {
    case "image":
      return (
        <div className={"edge-property"}>
          <img src={value?.uri} alt="" style={{ width: "100%" }} />
        </div>
      );
    case "audio":
      return (
        <div className={"edge-property"}>
          <AudioPlayer url={value?.uri} />
        </div>
      );
    case "video":
      return (
        <div className={"edge-property"}>
          <video src={value?.uri} controls style={{ width: "100%" }} />
        </div>
      );
    case "list":
      return (
        <div className={"edge-property"}>
          <ul className="list-view">
            {value?.map((item: any, i: number) => {
              let itemType = type;
              if (typeof item === "object" && "type" in item) {
                itemType = {
                  type: item.type
                };
              }
              return (
                <ListItemProperty
                  type={itemType}
                  value={item}
                  key={i}
                  id={id}
                />
              );
            })}
          </ul>
        </div>
      );
    case "dataframe":
      return (
        <div className={"edge-property"}>
          {value === undefined ? (
            <Typography>None</Typography>
          ) : (
            <DataTable data={value as DataFrame} />
          )}
        </div>
      );
    case "dict":
      return (
        <div className={"edge-property"}>
          {value === undefined ? (
            <Typography>None</Typography>
          ) : (
            <DictTable data={value} />
          )}
        </div>
      );
    case "thread_message":
      return (
        <div className={"edge-property"}>
          <Typography
            style={{
              userSelect: "text",
              backgroundColor: "#888",
              padding: "0.5em",
              cursor: "auto",
              color: "#111",
              fontFamily: ThemeNodetool.fontFamily1,
              lineHeight: "1.2em",
              maxHeight: "20em",
              overflowY: "auto",
              overflowX: "hidden",
              marginTop: ".5em"
            }}
            className="value nodrag nowheel"
          >
            {value.content.map((c: any, i: number) => {
              if (c.type === "message_text_content") {
                return <MarkdownRenderer key={'_' + i} content={c.text || ""} />;
              } else if (c.type === "message_image_content") {
                return <img key={'_' + i} src={c.image?.uri} alt="" />;
              } else {
                return <></>;
              }
            })}
          </Typography>
        </div>
      );
    default:
      return (
        <div className={"edge-property"}>
          <Typography
            style={{
              userSelect: "text",
              backgroundColor: "#888",
              padding: "0.5em",
              cursor: "auto",
              color: "#111",
              fontFamily: ThemeNodetool.fontFamily1,
              lineHeight: "1.2em",
              maxHeight: "20em",
              overflowY: "auto",
              overflowX: "hidden",
              marginTop: ".5em"
            }}
            className="value nodrag nowheel"
          >
            {value?.toString()}
          </Typography>
        </div>
      );
  }
};

export default ListItemProperty;
