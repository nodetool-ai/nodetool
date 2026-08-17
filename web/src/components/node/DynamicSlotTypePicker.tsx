import React, { memo, useCallback, useMemo, useState } from "react";

import {
  BORDER_RADIUS,
  Chip,
  MOTION,
  MenuItemPrimitive,
  Popover,
  SPACING,
  TYPOGRAPHY,
  Tooltip,
  getSpacingPx
} from "../ui_primitives";
import type { NodeMetadata, TypeMetadata } from "../../stores/ApiTypes";
import { colorForType } from "../../config/data_types";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import {
  allowedSlotTypes,
  slotTypeKey,
  slotTypeLabel
} from "../../utils/dynamicSlotTypes";

interface DynamicSlotTypePickerProps {
  /** Name of the dynamic slot being typed. */
  propertyName: string;
  /** Currently declared type; `any` when the slot is untyped. */
  value: TypeMetadata;
  /** Metadata of the node the slot belongs to (narrows the palette). */
  nodeMetadata?: NodeMetadata;
  onChange: (type: TypeMetadata) => void;
}

/**
 * Compact type chip + dropdown for one dynamic input slot. The chip carries
 * the datatype color, so a typed slot reads like every other typed handle.
 */
const DynamicSlotTypePickerImpl: React.FC<DynamicSlotTypePickerProps> = ({
  propertyName,
  value,
  nodeMetadata,
  onChange
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const options = useMemo(
    () => allowedSlotTypes(nodeMetadata),
    [nodeMetadata]
  );
  const currentKey = slotTypeKey(value);

  const handleOpen = useCallback((event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => setAnchorEl(null), []);

  const handleSelect = useCallback(
    (type: TypeMetadata) => {
      onChange(type);
      setAnchorEl(null);
    },
    [onChange]
  );

  const color = colorForType(
    value.type === "list" && value.type_args?.length === 1
      ? value.type_args[0].type
      : value.type
  );

  return (
    <>
      <Tooltip
        title={`Slot type for "${propertyName}"`}
        delay={TOOLTIP_ENTER_DELAY}
      >
        <Chip
          className="dynamic-slot-type-chip"
          compact
          clickable
          label={slotTypeLabel(value)}
          aria-label={`Slot type for ${propertyName}`}
          aria-haspopup="listbox"
          onClick={handleOpen}
          sx={{
            borderRadius: BORDER_RADIUS.sm,
            ...TYPOGRAPHY.mono.caption,
            borderLeft: `2px solid ${color}`,
            transition: `opacity ${MOTION.fast}`
          }}
        />
      </Tooltip>
      <Popover
        open={anchorEl !== null}
        anchorEl={anchorEl}
        onClose={handleClose}
        placement="bottom-left"
        maxHeight={320}
        paperSx={{ padding: getSpacingPx(SPACING.xs) }}
      >
        <div role="listbox" aria-label={`Slot type options for ${propertyName}`}>
          {options.map((option) => (
            <MenuItemPrimitive
              key={slotTypeKey(option)}
              compact
              label={slotTypeLabel(option)}
              selected={slotTypeKey(option) === currentKey}
              onClick={() => handleSelect(option)}
            />
          ))}
        </div>
      </Popover>
    </>
  );
};

export const DynamicSlotTypePicker = memo(DynamicSlotTypePickerImpl);
DynamicSlotTypePicker.displayName = "DynamicSlotTypePicker";

export default DynamicSlotTypePicker;
