/**
 * OptionChip — one media-composer setting chip that owns the popover it opens.
 *
 * The composer used to hold one anchor `useState` per chip and wire the chip
 * to its menu by hand, so a mode block was the same six lines repeated. Here
 * the anchor lives with the chip, and `menu` picks between the list popover
 * and the aspect-ratio grid.
 */
import React, { useCallback, useState } from "react";

import MediaControlChip from "./MediaControlChip";
import MediaOptionMenu, { type MediaOption } from "./MediaOptionMenu";
import MediaAspectRatioMenu from "./MediaAspectRatioMenu";
import type { AspectRatioOption } from "../../../stores/MediaGenerationStore";

interface OptionChipCommonProps {
  icon?: React.ReactNode;
  label: React.ReactNode;
  /** Native tooltip / accessible name. */
  title?: string;
  showChevron?: boolean;
  disabled?: boolean;
}

export type OptionChipProps<T extends string | number> = OptionChipCommonProps &
  (
    | {
        menu: "option";
        /** Popover header (e.g. "Image Resolution"). */
        header?: string;
        value: T;
        options: MediaOption<T>[];
        onChange: (value: T) => void;
      }
    | {
        menu: "aspect";
        header?: undefined;
        value: string;
        options: AspectRatioOption[];
        onChange: (value: string) => void;
      }
  );

export function OptionChip<T extends string | number>(
  props: OptionChipProps<T>
) {
  const { icon, label, title, showChevron = false, disabled } = props;
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const open = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    setAnchor(e.currentTarget);
  }, []);
  const close = useCallback(() => setAnchor(null), []);

  return (
    <>
      <MediaControlChip
        icon={icon}
        label={label}
        title={title}
        active={anchor !== null}
        onClick={open}
        showChevron={showChevron}
        disabled={disabled}
      />
      {props.menu === "aspect" ? (
        <MediaAspectRatioMenu
          anchorEl={anchor}
          open={anchor !== null}
          onClose={close}
          value={props.value}
          options={props.options}
          onChange={props.onChange}
        />
      ) : (
        <MediaOptionMenu
          anchorEl={anchor}
          open={anchor !== null}
          onClose={close}
          header={props.header}
          value={props.value}
          options={props.options}
          onChange={props.onChange}
        />
      )}
    </>
  );
}

export default OptionChip;
