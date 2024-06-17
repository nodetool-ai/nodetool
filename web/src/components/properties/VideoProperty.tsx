/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useAsset } from "../../serverState/useAsset";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import PropertyDropzone from "./PropertyDropzone";

const styles = (theme: any) =>
  css({
    "& .property-label": {
      marginBottom: "5px"
    }
  });
export default function VideoProperty(props: PropertyProps) {
  const id = `video-${props.property.name}-${props.propertyIndex}`;
  const { asset, uri } = useAsset({ video: props.value });

  return (
    <div className="video-property" css={styles}>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      <PropertyDropzone
        asset={asset}
        uri={uri}
        onChange={props.onChange}
        contentType="video"
        props={props}
      />
    </div>
  );
}
