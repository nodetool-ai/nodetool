/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useAsset } from "../../serverState/useAsset";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import PropertyDropzone from "./PropertyDropzone";
import { memo } from "react";
import isEqual from "fast-deep-equal";
import { useUpstreamValue } from "../../hooks/nodes/useNodeIO";
import ImageRefPreview from "../node/ImageRefPreview";

const connectedPreviewStyles = css({
  position: "relative",
  width: "100%",
  borderRadius: "var(--rounded-md)",
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.1)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "80px",
  backgroundColor: "rgba(0,0,0,0.15)"
});

const awaitingStyles = css({
  color: "rgba(255,255,255,0.3)",
  fontSize: "var(--fontSizeSmall)",
  textAlign: "center",
  padding: "16px 8px"
});

const ImageProperty = (props: PropertyProps) => {
  const id = `image-${props.property.name}-${props.propertyIndex}`;

  const { asset, uri } = useAsset({ image: props.value });

  const upstreamValue = useUpstreamValue(
    props.workflowId ?? "",
    props.nodeId,
    props.property.name
  );

  return (
    <div
      className="image-property"
      css={css({
        "& .property-label": {
          marginBottom: "5px"
        }
      })}
    >
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      {props.isConnected ? (
        <div css={connectedPreviewStyles}>
          <ImageRefPreview
            value={upstreamValue}
            placeholder={<div css={awaitingStyles}>Awaiting upstream</div>}
          />
        </div>
      ) : (
        <PropertyDropzone
          asset={asset}
          uri={uri}
          onChange={props.onChange}
          contentType="image"
          props={props}
        />
      )}
    </div>
  );
};

export default memo(ImageProperty, isEqual);
