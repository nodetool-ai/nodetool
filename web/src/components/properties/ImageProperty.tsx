/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useAsset } from "../../serverState/useAsset";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import PropertyDropzone from "./PropertyDropzone";

export default function ImageProperty(props: PropertyProps) {
  const id = `image-${props.property.name}-${props.propertyIndex}`;

  const { asset, uri } = useAsset({ image: props.value });

  const styles = (theme: any) =>
    css({
      ".property-label": {
        marginBottom: "5px"
      }
    });

  return (
    <div className="image-property" css={styles}>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      <PropertyDropzone
        asset={asset}
        uri={uri}
        onChange={props.onChange}
        contentType="image"
        props={props}
      />
      {/* <PropertyDropzone asset={asset} uri={uri} onChange={props.onChange}>
        <AssetViewer
          contentType={"image/*"}
          url={uri}
          open={openViewer}
          onClose={() => setOpenViewer(false)}
        />
        <img
          src={asset?.get_url || uri || ""}
          alt=""
          style={{ width: "100%" }}
          onDoubleClick={() => setOpenViewer(true)}
        />
      </PropertyDropzone> */}
    </div>
  );
}
