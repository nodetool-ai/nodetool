/**
 * `ImageCompare` — two bound images under one wipe handle.
 *
 * An edit-an-image run has a before and an after, and the `Image` widget binds
 * one value: placing two of them side by side hides the very difference the run
 * was asked to make. This binds both slots to the comparer the graph editor,
 * the preview grid and the asset viewer already use.
 *
 * Each bound value is a locator — an ImageRef, an asset id, a data URI, a URL —
 * and the comparer sets `src` from what it is handed, so both go through
 * `useResolvedMediaUri` first. An `asset://` locator fetches nowhere.
 */
import React from "react";

import {
  Box,
  Caption,
  FlexColumn,
  ResponsiveImage,
  BORDER_RADIUS,
  SPACING
} from "../../ui_primitives";
import ImageComparer from "../../widgets/ImageComparer";
import {
  useResolvedMediaUri,
  type MediaLocator
} from "../../../hooks/useResolvedMediaUri";
import {
  isFiniteNumber,
  isObjectLike,
  isString
} from "../../../utils/typePredicates";
import {
  useBindingRef,
  useBindingValue
} from "../runtime/AppRuntimeContext";
import { useWidgetRuntime } from "./useWidgetRuntime";

export interface ImageComparerWidgetProps {
  id: string;
  /** The "before" image. */
  binding?: string;
  /** The "after" image. */
  compareBinding?: string;
  label?: string;
  /** Caps the rendered height. */
  height?: number;
  placeholder?: string;
}

const DEFAULT_HEIGHT = 320;

/** A bound output holds one value or the accumulated list of streamed items. */
const lastItem = (value: unknown): unknown => {
  if (!Array.isArray(value)) return value;
  return value.length > 0 ? value[value.length - 1] : undefined;
};

/**
 * The locator a bound value carries. A `*Ref` may name its asset by `asset_id`
 * with no `uri` at all, so both halves travel to the resolver rather than only
 * the URI the older widgets read.
 */
const toLocator = (value: unknown): MediaLocator => {
  const item = lastItem(value);
  if (isString(item)) return item.length > 0 ? item : undefined;
  if (!isObjectLike(item)) return undefined;
  const uri = [item.uri, item.url, item.data].find(
    (candidate): candidate is string => isString(candidate) && candidate !== ""
  );
  const assetId = isString(item.asset_id) && item.asset_id !== ""
    ? item.asset_id
    : undefined;
  return uri === undefined && assetId === undefined
    ? undefined
    : { uri, asset_id: assetId };
};

const Placeholder: React.FC<{ height: number; text: string }> = ({
  height,
  text
}) => (
  <FlexColumn
    align="center"
    justify="center"
    fullWidth
    sx={{
      height,
      border: "1px dashed",
      borderColor: "divider",
      borderRadius: BORDER_RADIUS.md
    }}
  >
    <Caption color="secondary">{text}</Caption>
  </FlexColumn>
);

export const ImageComparerWidget: React.FC<ImageComparerWidgetProps> = ({
  id,
  binding,
  compareBinding,
  label,
  height,
  placeholder
}) => {
  const { value, designMode } = useWidgetRuntime({
    id,
    bindingMode: "read",
    binding
  });
  const compareRef = useBindingRef(compareBinding, "read");
  const compareValue = useBindingValue(compareRef);

  const beforeLocator = React.useMemo(() => toLocator(value), [value]);
  const afterLocator = React.useMemo(
    () => toLocator(compareValue),
    [compareValue]
  );
  const before = useResolvedMediaUri(beforeLocator);
  const after = useResolvedMediaUri(afterLocator);

  const boxHeight = isFiniteNumber(height) ? height : DEFAULT_HEIGHT;
  const single = before ?? after;

  const withLabel = (body: React.ReactElement): React.ReactElement =>
    label ? (
      <FlexColumn gap={SPACING.xs} fullWidth>
        <Caption color="secondary">{label}</Caption>
        {body}
      </FlexColumn>
    ) : (
      body
    );

  if (before && after) {
    return withLabel(
      <Box
        sx={{
          width: "100%",
          height: boxHeight,
          borderRadius: BORDER_RADIUS.md,
          overflow: "hidden"
        }}
      >
        <ImageComparer
          imageA={before}
          imageB={after}
          labelA="Before"
          labelB="After"
        />
      </Box>
    );
  }

  if (single) {
    return withLabel(
      <ResponsiveImage
        src={single}
        alt=""
        fit="contain"
        borderRadius={BORDER_RADIUS.md}
        sx={{ height: boxHeight }}
      />
    );
  }

  // In design mode nothing has run, so an author placing the widget sees what
  // it wants rather than the empty-run copy their users will see.
  return withLabel(
    <Placeholder
      height={boxHeight}
      text={
        designMode
          ? "Bind two image outputs to compare them."
          : (placeholder ?? "Nothing to compare yet")
      }
    />
  );
};
