/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import { SPACING, BORDER_RADIUS, getSpacingPx } from "../ui_primitives";
import { useAsset } from "../../serverState/useAsset";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import PropertyDropzone from "./PropertyDropzone";
import { memo } from "react";
import isEqual from "../../utils/isEqual";
import { useUpstreamValue } from "../../hooks/nodes/useNodeIO";
import ImageRefPreview from "../node/ImageRefPreview";

const connectedPreviewStyles = css({
  position: "relative",
  width: "100%",
  borderRadius: BORDER_RADIUS.md,
  overflow: "hidden",
  border: "1px solid var(--palette-c_overlay_strong)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "80px",
  backgroundColor: "var(--palette-c_scrim_soft)"
});

const awaitingStyles = css({
  color: "var(--palette-text-disabled)",
  fontSize: "var(--fontSizeSmall)",
  textAlign: "center",
  padding: `${getSpacingPx(SPACING.xl)} ${getSpacingPx(SPACING.md)}`
});

const ImageProperty = (props: PropertyProps) => {
  const theme = useTheme();
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
          marginBottom: theme.spacing(SPACING.sm)
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
