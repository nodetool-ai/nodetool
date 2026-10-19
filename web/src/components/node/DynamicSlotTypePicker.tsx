import React, { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Chip,
  ContextMenu,
  MenuItemPrimitive,
  TYPOGRAPHY,
  Tooltip
} from "../ui_primitives";
import type { NodeMetadata, TypeMetadata } from "../../stores/ApiTypes";
import { colorForType } from "../../config/data_types";
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
  const { t } = useTranslation();
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
        title={t("i18n-next36.nodeEditor.dynamicSlotType.slotTypeFor", {
          propertyName
        })}
      >
        <Chip
          className="dynamic-slot-type-chip"
          compact
          clickable
          label={slotTypeLabel(value)}
          aria-label={t("i18n-next36.nodeEditor.dynamicSlotType.slotTypeForLabel", {
            propertyName
          })}
          aria-haspopup="menu"
          onClick={handleOpen}
          accent={color}
          sx={TYPOGRAPHY.mono.caption}
        />
      </Tooltip>
      <ContextMenu
        open={anchorEl !== null}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        maxHeight={320}
        slotProps={{
          list: {
            "aria-label": t(
              "i18n-next36.nodeEditor.dynamicSlotType.slotTypeOptionsFor",
              { propertyName }
            )
          }
        }}
      >
        {options.map((option) => (
          <MenuItemPrimitive
            key={slotTypeKey(option)}
            label={slotTypeLabel(option)}
            selected={slotTypeKey(option) === currentKey}
            onClick={() => handleSelect(option)}
          />
        ))}
      </ContextMenu>
    </>
  );
};

export const DynamicSlotTypePicker = memo(DynamicSlotTypePickerImpl);
DynamicSlotTypePicker.displayName = "DynamicSlotTypePicker";

export default DynamicSlotTypePicker;
