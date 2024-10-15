/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useAsset } from "../../serverState/useAsset";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import PropertyDropzone from "./PropertyDropzone";
import { memo } from "react";
import { isEqual } from "lodash";

const styles = (theme: any) =>
  css({
    "& .property-label": {
      marginBottom: "5px"
    },
    "& .toggle-url-button": {
      top: "-2.5em",
      right: "0"
    },
    "& .dropzone": {
      width: "100%"
    },
    "& .url-input": {
      width: "100%"
    }
  });

const AudioProperty = (props: PropertyProps) => {
  const id = `audio-${props.property.name}-${props.propertyIndex}`;
  const { asset, uri } = useAsset({ audio: props.value });

  return (
    <div className="audio-property" css={styles}>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      {props.nodeType === "nodetool.constant.Audio" && (
        <PropertyDropzone
          asset={asset}
          uri={uri || ""}
          onChange={props.onChange}
          contentType="audio"
          props={props}
        />
      )}
    </div>
  );
};

export default memo(AudioProperty, isEqual);
