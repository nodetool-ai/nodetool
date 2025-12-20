/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useAsset } from "../../serverState/useAsset";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import PropertyDropzone from "./PropertyDropzone";
import isEqual from "lodash/isEqual";
import { memo } from "react";

const styles = (theme: Theme) =>
  css({
    "& .property-label": {
      marginBottom: "5px"
    }
  });

const VideoProperty = (props: PropertyProps) => {
  const id = `video-${props.property.name}-${props.propertyIndex}`;
  const { asset, uri } = useAsset({ video: props.value });
  const theme = useTheme();
  return (
    <div className="video-property" css={styles(theme)}>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      {(props.nodeType === "nodetool.constant.Video" ||
        props.nodeType === "nodetool.input.VideoInput") && (
        <PropertyDropzone
          asset={asset}
          uri={uri}
          onChange={props.onChange}
          contentType="video"
          props={props}
        />
      )}
    </div>
  );
};

export default memo(VideoProperty, isEqual);
