/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useState } from "react";
import PropertyLabel from "../node/PropertyLabel";
import TextareaAutosize from "react-textarea-autosize";
import { PropertyProps } from "../node/PropertyInput";
import { Button } from "@mui/material";

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
    ".container.expanded": {
      position: "fixed",
      top: 0,
      left: 0,
      width: "400px",
      height: "200px",
      zIndex: 1000,
      backgroundColor: theme.palette.c_gray1,
      padding: "20px",
      display: "flex",
      flexDirection: "column"
    },
    ".container.expanded textarea": {
      width: "100%",
      height: "100%",
      flex: 1
    },
    ".button-expand": {
      position: "absolute",
      zIndex: 0,
      right: "4px",
      top: "4px",
      cursor: "pointer"
    },
    ".expanded .button-expand": {
      position: "absolute",
      right: "4px",
      top: "4px"
    }
  });

export default function StringProperty(props: PropertyProps) {
  const id = `textfield-${props.property.name}-${props.propertyIndex}`;
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div css={styles}>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      <div className={`container ${isExpanded ? "expanded" : ""}`}>
        {isExpanded && (
          <div>
            <PropertyLabel
              name={props.property.name}
              description={props.property.description}
              id={id}
            />
          </div>
        )}
        <TextareaAutosize
          // causing too many re-renders, see https://stackoverflow.com/questions/64837884/material-ui-too-many-re-renders-the-layout-is-unstable-textareaautosize-limit
          // > trying to fix this by using TextareaAutosize instead.
          // > switched to TextareaAutosize from 'react-textarea-autosize'. seems to fix 'ResizeObserver loop limit exceeded'
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
        />
        <Button className="button-expand" onClick={toggleExpand}>
          {isExpanded ? "↙" : "↗"}
        </Button>
      </div>
    </div>
  );
}
