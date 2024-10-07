/** @jsxImportSource @emotion/react */
import { css, useTheme } from "@emotion/react";
import { useState } from "react";
import PropertyLabel from "../node/PropertyLabel";
import TextareaAutosize from "react-textarea-autosize";
import { PropertyProps } from "../node/PropertyInput";
import TextEditorModal from "./TextEditorModal";
import { TOOLTIP_ENTER_DELAY } from "../node/BaseNode";
import { Tooltip } from "@mui/material";

const styles = (theme: any) =>
  css({
    textarea: {
      outline: "none",
      backgroundColor: theme.palette.c_gray1,
      border: "none",
      borderRadius: "0",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmaller,
      lineHeight: "1.1"
    },
    ".container": {
      position: "relative"
    },
    ".button-expand": {
      position: "absolute",
      zIndex: 0,
      top: "-11px",
      right: "0px",
      cursor: "pointer",
      width: "1em",
      height: "1em",
      fontSize: "1em",
      padding: 0,
      border: "none",
      color: theme.palette.c_gray6,
      backgroundColor: theme.palette.c_gray2,
      fontWeight: "bold"
    },
    ".button-expand:hover": {
      color: theme.palette.c_hl1,
      backgroundColor: theme.palette.c_gray2
    }
  });

export default function StringProperty(props: PropertyProps) {
  const theme = useTheme();
  const id = `textfield-${props.property.name}-${props.propertyIndex}`;
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div css={styles(theme)}>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      <div className="container">
        <TextareaAutosize
          id={id}
          name={props.property.name}
          minRows={1}
          maxRows={4}
          className="nodrag nowheel"
          value={props.value || ""}
          onChange={(e) => {
            props.onChange(e.target.value);
          }}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          // css={styles(theme).textarea}
        />
        <Tooltip title="Open Editor" enterDelay={TOOLTIP_ENTER_DELAY}>
          <button className="button-expand" onClick={toggleExpand}>
            {isExpanded ? "↙" : "↗"}
          </button>
        </Tooltip>
      </div>
      {isExpanded && (
        <TextEditorModal
          value={props.value || ""}
          onChange={props.onChange}
          onClose={toggleExpand}
          propertyName={props.property.name}
          propertyDescription={props.property.description || ""}
        />
      )}
    </div>
  );
}
