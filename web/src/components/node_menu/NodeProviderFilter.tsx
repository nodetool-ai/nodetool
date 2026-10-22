import React, { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";

import { Chip, ContextMenu, MenuItemPrimitive } from "../ui_primitives";

export interface NodeProviderOption {
  id: string;
  label: string;
  /** Nodes of this provider in the active category. */
  count: number;
}

interface NodeProviderFilterProps {
  /** Local first, then API providers. */
  options: readonly NodeProviderOption[];
  /** Nodes in the active category across every provider. */
  totalCount: number;
  /** The picked provider id, or null for every provider. */
  value: string | null;
  onChange: (providerId: string | null) => void;
  className?: string;
}

/**
 * One chip in the node library's search row that opens the provider list.
 * It reads "All providers" until a provider is picked, then names it.
 */
const NodeProviderFilterImpl: React.FC<NodeProviderFilterProps> = ({
  options,
  totalCount,
  value,
  onChange,
  className
}) => {
  const { t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const selected = options.find((option) => option.id === value);
  const label = selected?.label ?? t("nodeLibrary.allProviders");

  const handleOpen = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => setAnchorEl(null), []);

  const handleSelect = useCallback(
    (providerId: string | null) => {
      onChange(providerId);
      setAnchorEl(null);
    },
    [onChange]
  );

  return (
    <>
      <Chip
        className={className}
        compact
        clickable
        active={selected !== undefined}
        label={
          <>
            <span className="node-provider-filter-label">{label}</span>
            <ArrowDropDownIcon aria-hidden />
          </>
        }
        aria-label={t("nodeLibrary.providerFilter", { provider: label })}
        aria-haspopup="menu"
        aria-expanded={anchorEl !== null}
        onClick={handleOpen}
        sx={{
          flexShrink: 0,
          maxWidth: "45%",
          "& .MuiChip-label": {
            display: "inline-flex",
            alignItems: "center",
            minWidth: 0,
            paddingRight: 0
          },
          "& .node-provider-filter-label": {
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          },
          "& .MuiSvgIcon-root": { fontSize: "var(--fontSizeBig)" }
        }}
      />
      <ContextMenu
        open={anchorEl !== null}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        maxHeight={360}
        slotProps={{
          list: { "aria-label": t("nodeLibrary.providers") }
        }}
      >
        <MenuItemPrimitive
          label={t("nodeLibrary.allProviders")}
          shortcut={String(totalCount)}
          checkable="radio"
          checked={value === null}
          onClick={() => handleSelect(null)}
          dividerAfter
        />
        {options.map((option) => (
          <MenuItemPrimitive
            key={option.id}
            label={option.label}
            shortcut={String(option.count)}
            checkable="radio"
            checked={option.id === value}
            onClick={() => handleSelect(option.id)}
          />
        ))}
      </ContextMenu>
    </>
  );
};

export const NodeProviderFilter = memo(NodeProviderFilterImpl);
NodeProviderFilter.displayName = "NodeProviderFilter";

export default NodeProviderFilter;
