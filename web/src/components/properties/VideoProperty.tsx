/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { SPACING } from "../ui_primitives";
import { useAsset } from "../../serverState/useAsset";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import PropertyDropzone from "./PropertyDropzone";
import isEqual from "../../utils/isEqual";
import { memo, useMemo } from "react";

const styles = (theme: Theme) =>
  css({
    "& .property-label": {
      marginBottom: theme.spacing(SPACING.sm)
    }
  });

const VideoProperty = (props: PropertyProps) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const id = `video-${props.property.name}-${props.propertyIndex}`;
  const { asset, uri } = useAsset({ video: props.value });
  const showRecorder =
    props.nodeType === "nodetool.input.VideoInput" ||
    props.nodeType === "nodetool.constant.Video";
  return (
    <div className="video-property" css={cssStyles}>
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
          showRecorder={showRecorder}
        />
      )}
    </div>
  );
};

export default memo(VideoProperty, isEqual);
