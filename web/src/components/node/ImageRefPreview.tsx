import React from "react";
import { isBitmapImage } from "@nodetool-ai/protocol";
import ImageView from "./ImageView";
import { asImageRef, isRawRgbaRef } from "../../utils/imageRef";
import { rawRgbaToPngDataUrl } from "../../lib/workflow/materializeBrowserOutputs";

interface ImageRefPreviewProps {
  /** A node output/input value in any of the shapes `asImageRef` understands. */
  value: unknown;
  /** Rendered when `value` carries no displayable image (e.g. a dropzone). */
  placeholder?: React.ReactNode;
}

/**
 * The single image-preview ladder shared by the node editor bodies
 * (Curves, Levels, Blur, Mask, …). Each used to hand-roll this same sequence:
 *
 *   string → raw-RGBA (canvas) → uri → inline bytes → number-array → placeholder
 *
 * Consolidated here so a new in-flight format (the GPU runner's raw-RGBA buffer,
 * encoded to a PNG data URL) is handled in exactly one place.
 */
const ImageRefPreview: React.FC<ImageRefPreviewProps> = ({
  value,
  placeholder
}) => {
  if (typeof value === "string" && value) {
    return <ImageView source={value} />;
  }
  // Preview-bitmap ref from the in-browser runner (zero-copy transport) —
  // paint it directly. Checked on the raw value: `asImageRef` keeps only the
  // uri/data fields, so the bitmap would be dropped below.
  if (isBitmapImage(value)) {
    return <ImageView bitmap={value.bitmap as ImageBitmap} />;
  }
  const ref = asImageRef(value);
  if (isRawRgbaRef(ref)) {
    // Defensive: in-flight raw-RGBA is normally encoded to a uri by
    // materializeBrowserOutputs before it reaches here; encode any that slips
    // through to a data URL so the <img> path can render it.
    return (
      <ImageView source={rawRgbaToPngDataUrl(ref.data, ref.width, ref.height)} />
    );
  }
  if (ref?.uri) {
    return <ImageView source={ref.uri} />;
  }
  if (typeof ref?.data === "string" && ref.data) {
    return <ImageView source={ref.data} />;
  }
  if (ref?.data instanceof Uint8Array) {
    return <ImageView source={ref.data} />;
  }
  if (Array.isArray(ref?.data)) {
    return <ImageView source={new Uint8Array(ref!.data as number[])} />;
  }
  return <>{placeholder ?? null}</>;
};

export default React.memo(ImageRefPreview);
