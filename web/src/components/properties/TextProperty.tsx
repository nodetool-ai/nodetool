/** @jsxImportSource @emotion/react */
import { css, useTheme } from "@emotion/react";
import React, { memo, useMemo } from "react";

import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import TextAssetDisplay from "./TextAssetDisplay";
import { isEqual } from "lodash";

const styles = (theme: any) =>
  css({
    ".text": {
      outline: "none",
      backgroundColor: theme.palette.grey[800],
      border: "none",
      borderRadius: "0",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeTiny,
      lineHeight: "1.2"
    },
    ".container": {
      position: "relative"
    },
    ".button-expand": {
      position: "absolute",
      zIndex: 0,
      top: "-6px",
      right: "0px",
      cursor: "pointer",
      width: "1em",
      height: "1em",
      fontSize: "1em",
      padding: 0,
      border: "none",
      color: theme.palette.grey[100],
      backgroundColor: theme.palette.grey[600],
      fontWeight: "bold"
    },
    ".button-expand:hover": {
      color: theme.palette.c_hl1,
      backgroundColor: theme.palette.grey[600]
    }
  });

const TextProperty = (props: PropertyProps) => {
  const id = `textfield-${props.property.name}-${props.propertyIndex}`;
  const assetId = props.value.asset_id;
  const theme = useTheme();

  const memoizedStyles = useMemo(() => styles(theme), [theme]);

  return (
    <div
      css={memoizedStyles}
      className="nowheel nopan"
      style={{
        width: "100%",
        padding: "0",
        margin: "0"
      }}
    >
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      {props.nodeType === "nodetool.constant.Text" && (
        <TextAssetDisplay assetId={assetId} />
      )}
    </div>
  );
};

export default memo(TextProperty, isEqual);
