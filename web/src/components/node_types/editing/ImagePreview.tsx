/**
 * ImagePreview — the image preview shared by the bespoke node bodies.
 *
 * An `ImageRefPreview` whose empty state is a `CheckerDropzone`. Every
 * editing body used to paste this wrapper locally.
 */

import React, { memo } from "react";
import ImageIcon from "@mui/icons-material/Image";

import { CheckerDropzone } from "../../ui_primitives";
import ImageRefPreview from "../../node/ImageRefPreview";

export interface ImagePreviewProps {
  /** A node output/input value in any shape `ImageRefPreview` understands. */
  value: unknown;
  /** Text shown in the empty state. */
  message?: string;
  /** Icon shown in the empty state. Pass `null` for none. */
  icon?: React.ReactNode;
  /** Class applied to the empty-state surface. */
  placeholderClassName?: string;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({
  value,
  message = "Connect an image, then run",
  icon = <ImageIcon />,
  placeholderClassName
}) => (
  <ImageRefPreview
    value={value}
    placeholder={
      <CheckerDropzone
        className={placeholderClassName}
        message={message}
        icon={icon ?? undefined}
      />
    }
  />
);

export default memo(ImagePreview);
