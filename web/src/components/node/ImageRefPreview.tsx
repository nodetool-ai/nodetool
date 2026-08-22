import React from "react";
import { isBitmapImage } from "@nodetool-ai/protocol";
import ImageView from "./ImageView";
import { asImageRef, isRawRgbaRef } from "../../utils/imageRef";
import { rawRgbaToPngDataUrl } from "../../lib/workflow/materializeBrowserOutputs";
import { useResolvedMediaUri } from "../../hooks/useResolvedMediaUri";
import { isString } from "../../utils/typePredicates";
import { resolveInlineMediaSource } from "../../utils/resolveMediaUri";

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
  const stringSource = isString(value) && value ? value : undefined;
  const ref = asImageRef(value);
  // An `asset://` locator resolves to the asset's signed `get_url`; every other
  // scheme (data:, blob:, http:, package://, file://) comes back unchanged, and
  // is `undefined` only while a lookup is in flight.
  const resolvedUri = useResolvedMediaUri(
    stringSource ?? (ref?.uri || ref?.asset_id ? ref : undefined)
  );

  if (stringSource) {
    return <ImageView source={resolvedUri} />;
  }
  // Preview-bitmap ref from the in-browser runner (zero-copy transport) —
  // paint it directly. Checked on the raw value: `asImageRef` keeps only the
  // uri/data fields, so the bitmap would be dropped below.
  if (isBitmapImage(value)) {
    return <ImageView bitmap={value.bitmap as ImageBitmap} />;
  }
  if (isRawRgbaRef(ref)) {
    // Defensive: in-flight raw-RGBA is normally encoded to a uri by
    // materializeBrowserOutputs before it reaches here; encode any that slips
    // through to a data URL so the <img> path can render it.
    return (
      <ImageView
        source={resolveInlineMediaSource(
          rawRgbaToPngDataUrl(ref.data, ref.width, ref.height)
        )}
      />
    );
  }
  if (ref?.uri) {
    return <ImageView source={resolvedUri} />;
  }
  if (isString(ref?.data) && ref.data) {
    return <ImageView source={resolveInlineMediaSource(ref.data)} />;
  }
  if (ref?.data instanceof Uint8Array) {
    return <ImageView source={ref.data} />;
  }
  if (Array.isArray(ref?.data)) {
    return <ImageView source={new Uint8Array(ref!.data as number[])} />;
  }
  // A ref that carries only `asset_id` (no uri, no bytes) — still displayable
  // once the asset record resolves.
  if (ref?.asset_id) {
    return <ImageView source={resolvedUri} />;
  }
  return <>{placeholder ?? null}</>;
};

export default React.memo(ImageRefPreview);
