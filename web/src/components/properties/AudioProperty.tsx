/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { useAsset } from "../../serverState/useAsset";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import PropertyDropzone from "./PropertyDropzone";
import { memo } from "react";
import { isEqual } from "lodash";

const styles = (theme: Theme) =>
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
  const showRecorder =
    props.nodeType === "nodetool.input.AudioInput" ||
    props.nodeType === "nodetool.constant.Audio";
  const theme = useTheme();
  return (
    <div className="audio-property" css={styles(theme)}>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      <PropertyDropzone
        asset={asset}
        uri={uri || ""}
        onChange={props.onChange}
        contentType="audio"
        props={props}
        showRecorder={showRecorder}
      />
    </div>
  );
};

export default memo(AudioProperty, isEqual);
