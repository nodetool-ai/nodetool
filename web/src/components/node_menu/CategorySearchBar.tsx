import { memo, useCallback } from "react";
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
  placeholder = "Filter",
  ref
}: CategorySearchBarProps) {
  const handleClear = useCallback(() => onChange(""), [onChange]);

  return (
    <SearchInput
      ref={ref}
      className="qa-search"
      value={value}
      onChange={onChange}
      onClear={handleClear}
      placeholder={placeholder}
      ariaLabel="Filter category"
      clearTooltip="Clear filter"
      fullWidth
    />
  );
});

export default CategorySearchBar;
