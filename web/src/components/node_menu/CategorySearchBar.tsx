import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { Ref } from "react";

import { SearchInput } from "../ui_primitives";

interface CategorySearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ref?: Ref<HTMLInputElement>;
}

/**
 * Slim search input shown at the top of a tile-grid category. Filters the
 * grid below by title/node_type/namespace substring.
 */
const CategorySearchBar = memo(function CategorySearchBar({
  value,
  onChange,
  placeholder,
  ref
}: CategorySearchBarProps) {
  const { t } = useTranslation();
  const handleClear = useCallback(() => onChange(""), [onChange]);

  return (
    <SearchInput
      ref={ref}
      className="qa-search"
      value={value}
      onChange={onChange}
      onClear={handleClear}
      placeholder={placeholder ?? t("screen_nodes.filter")}
      ariaLabel={t("screen_nodes.filterCategory")}
      clearTooltip={t("screen_nodes.clearFilter")}
      fullWidth
    />
  );
});

export default CategorySearchBar;
