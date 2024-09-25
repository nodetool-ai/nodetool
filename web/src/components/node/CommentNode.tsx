/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useState, useCallback, useRef } from "react";
import { NodeProps, NodeResizeControl } from "@xyflow/react";
import { debounce, isEqual } from "lodash";
import {
  Container,
  Dialog,
  DialogTitle,
  DialogContent,
  Button,
  IconButton,
  Typography
} from "@mui/material";
import { NodeData } from "../../stores/NodeData";
import { useNodeStore } from "../../stores/NodeStore";
import { createEditor } from "slate";
import { Slate, Editable, withReact, ReactEditor } from "slate-react";
import { BaseEditor, Descendant } from "slate";
import SouthEastIcon from "@mui/icons-material/SouthEast";
import ColorizeIcon from "@mui/icons-material/Colorize";
import { DATA_TYPES } from "../../config/data_types";
import ThemeNodetool from "../themes/ThemeNodetool";
import SearchInput from "../search/SearchInput";
import { hexToRgba, createLinearGradient } from "../../utils/ColorUtils";
type CustomElement = { type: "paragraph"; children: CustomText[] };
type CustomText = { text: string };

const styles = (theme: any) =>
  css({
    "&.comment-node": {
      width: "100%",
      height: "100%",
      margin: 0,
      padding: 0,
      backgroundColor: "transparent",
      "&.collapsed": {
        maxHeight: "60px"
      },
      label: {
        display: "none"
      }
    },
    ".node-header": {
      width: "100%",
      height: "20px",
      minHeight: "unset",
      margin: 0,
      padding: "0 0.5em",
      left: "0px",
      backgroundColor: "transparent",
      border: 0,
      position: "absolute",
      top: 0,
      display: "flex",
      alignItems: "center",
      input: {
        wordSpacing: "-3px",
        fontFamily: theme.fontFamily2,
        pointerEvents: "none"
      }
    },
    ".text-editor": {
      width: "100%",
      color: theme.palette.c_black,
      height: "calc(100% - 40px)",
      fontSize: theme.fontSizeSmall,
      fontFamily: theme.fontFamily1,
      wordSpacing: "-1px",
      lineHeight: "1.2em",
      position: "absolute",
      overflowX: "hidden",
      overflowY: "auto",
      top: "40px",
      left: 0,
      padding: "0 1em"
    },
    ".text-editor .editable": {
      outline: "none",
      border: 0,
      boxShadow: "none",
      outlineOffset: "0px",
      cursor: "auto"
    },
    ".color-picker-button": {
      opacity: 0,
      position: "absolute",
      bottom: "0",
      margin: 0,
      right: "1em",
      left: "unset",
      width: ".85em",
      height: ".85em",
      borderRadius: 0,
      zIndex: 10000,
      backgroundColor: theme.palette.c_gray2,
      "& svg": {
        color: theme.palette.c_gray5,
        width: ".6em",
        height: ".6em"
      },
      "&:hover svg": {
        color: theme.palette.c_hl1
      }
    },
    "&:hover .color-picker-button": {
      opacity: 1
    }
  });

const colorSelectStyles = (theme: any) =>
  css({
    ".color-button": {
      width: "98%",
      height: "2em",
      borderRadius: "2px",
      alignItems: "center",
      justifyContent: "start",
      border: "none",
      "&:hover": {
        opacity: 0.6
      },
      p: {
        fontSize: ThemeNodetool.fontSizeSmall,
        fontFamily: ThemeNodetool.fontFamily2,
        wordSpacing: "-3px",
        textAlign: "left",
        fontWeight: "bold"
      }
    },
    ".MuiDialog-paper": {
      width: "300px",
      height: "600px",
      overflowY: "scroll",
      padding: "0 .5em",
      borderRadius: 0
    },
    ".MuiDialogTitle-root": {
      backgroundColor: theme.palette.c_gray2,
      color: theme.palette.c_gray5,
      padding: "0.5em .75em"
    },
    ".MuiDialogContent-root": {
      backgroundColor: theme.palette.c_gray2,
      color: theme.palette.c_gray5,
      padding: "0.5em .5em 2em .5em"
    },
    ".search": {
      width: "100%",
      padding: "0 .5em",
      marginBottom: "1em",
      backgroundColor: "transparent",
      color: theme.palette.c_gray5
    }
  });

declare module "slate" {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor;
    Element: CustomElement;
    Text: CustomText;
  }
}

export default memo(
  function CommentNode(props: NodeProps<NodeData>) {
    const className = `comment-node ${
      props.data.collapsed ? "collapsed " : ""
    }${props.selected ? "selected" : ""}`.trim();
    const updateNodeData = useNodeStore((state) => state.updateNodeData);
    const [editor] = useState(() => withReact(createEditor()));
    const [color, setColor] = useState(
      props.data.properties.comment_color || "white"
    );
    const [headline, setHeadline] = useState(
      props.data.properties.headline || ""
    );
    const [value, setValue] = useState<Descendant[]>(() => {
      return Array.isArray(props.data.properties.comment) &&
        props.data.properties.comment.length > 0
        ? props.data.properties.comment
        : [{ type: "paragraph", children: [{ text: "" }] }];
    });
    const [modalOpen, setModalOpen] = useState(false);
    const headerInputRef = useRef<HTMLInputElement>(null);
    const [dataTypesFiltered, setDataTypesFiltered] = useState(DATA_TYPES);

    const handleChange = useCallback(
      (newValue: Descendant[]) => {
        setValue(newValue);
        debounce((newData) => {
          updateNodeData(props.id, {
            ...props.data,
            properties: {
              ...props.data.properties,
              ...newData
            }
          });
        }, 500)({
          comment: newValue
        });
      },
      [props.data, props.id, updateNodeData]
    );

    const handleHeadlineChange = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        const newHeadline = event.target.value;
        setHeadline(newHeadline);
        debounce((newData) => {
          updateNodeData(props.id, {
            ...props.data,
            properties: {
              ...props.data.properties,
              ...newData
            }
          });
        }, 500)({
          headline: newHeadline
        });
      },
      [props.data, props.id, updateNodeData]
    );

    const handleClick = () => {
      ReactEditor.focus(editor);
    };

    const handleHeaderClick = () => {
      headerInputRef.current?.focus();
      headerInputRef.current?.select();
    };

    const handleColorChange = (newColor: string) => {
      setColor(newColor);
      updateNodeData(props.id, {
        ...props.data,
        properties: {
          ...props.data.properties,
          comment_color: newColor
        }
      });
      setModalOpen(false);
    };

    const handleSearchChange = useCallback(
      (search: string) => {
        if (search === "") {
          setDataTypesFiltered(DATA_TYPES);
        } else {
          // filter datatypes by search string:
          setDataTypesFiltered(
            DATA_TYPES.filter((datatype) =>
              datatype.label.toLowerCase().includes(search.toLowerCase())
            )
          );
        }
      },
      [setDataTypesFiltered]
    );

    const handleModalOpen = () => {
      setModalOpen(true);
      setDataTypesFiltered(DATA_TYPES);
    };

    return (
      <Container
        style={{ backgroundColor: hexToRgba(color, 0.2) }}
        className={className}
        css={styles}
      >
        <NodeResizeControl
          style={{ background: "transparent", border: "none" }}
          minWidth={30}
          minHeight={40}
        >
          <SouthEastIcon />
        </NodeResizeControl>
        <IconButton
          size="small"
          className="color-picker-button"
          onClick={handleModalOpen}
        >
          <ColorizeIcon />
        </IconButton>
        <Dialog
          css={colorSelectStyles}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
        >
          <DialogTitle style={{ backgroundColor: "transparent" }}>
            datatype colors
          </DialogTitle>
          <div className="search">
            <SearchInput
              onSearchChange={handleSearchChange}
              focusOnTyping={true}
            />
          </div>
          <DialogContent>
            {dataTypesFiltered.map((datatype, index) => (
              <div key={datatype.slug} className="dt">
                <Button
                  className="color-button"
                  key={datatype + "_" + index}
                  style={{
                    background: createLinearGradient(
                      datatype.color,
                      140,
                      "to right",
                      "lighten"
                    )
                  }}
                  onClick={() => handleColorChange(datatype.color)}
                >
                  <Typography
                    style={{
                      color: datatype.textColor
                    }}
                  >
                    {datatype.label}
                  </Typography>
                </Button>
              </div>
            ))}
          </DialogContent>
        </Dialog>
        <div
          className="node-header"
          onClick={handleHeaderClick}
          style={{
            backgroundColor: hexToRgba(color, 0.1),
            padding: "1.25em .5em"
          }}
        >
          <input
            ref={headerInputRef}
            spellCheck={false}
            className="nodrag"
            type="text"
            value={headline}
            onChange={handleHeadlineChange}
            placeholder=""
            style={{
              backgroundColor: "transparent",
              color: "black",
              border: 0,
              outline: "none",
              width: "90%"
            }}
          />
        </div>
        <div className="text-editor" onClick={handleClick}>
          <Slate editor={editor} onChange={handleChange} initialValue={value}>
            <Editable
              placeholder="//"
              spellCheck={false}
              className="editable nodrag nowheel"
            />
          </Slate>
        </div>
      </Container>
    );
  },
  (prevProps, nextProps) => isEqual(prevProps, nextProps)
);
