/**
 * The Studio beginner shell's model control: a plain dropdown over the few
 * curated options for one role, with the selected option's blurb underneath.
 * No provider browser, no search, no API keys — the shared model selects swap
 * themselves for this inside the Studio shell.
 */

import React, { useCallback, useMemo } from "react";
import { SelectField } from "../../ui_primitives";
import type { CuratedOption } from "../../../studio/curatedModels";

interface CuratedModelSelectProps<T> {
  label: string;
  options: CuratedOption<T>[];
  /** Current selection's option id; anything unknown reads as nothing selected. */
  value: string;
  onChange: (value: T) => void;
  disabled?: boolean;
}

function CuratedModelSelectInner<T>({
  label,
  options,
  value,
  onChange,
  disabled
}: CuratedModelSelectProps<T>) {
  const selectOptions = useMemo(
    () => options.map((option) => ({ value: option.id, label: option.label })),
    [options]
  );
  const selected = useMemo(
    () => options.find((option) => option.id === value),
    [options, value]
  );
  const handleChange = useCallback(
    (id: string) => {
      const picked = options.find((option) => option.id === id);
      if (picked) onChange(picked.value);
    },
    [options, onChange]
  );

  return (
    <SelectField
      label={label}
      value={selected ? value : ""}
      onChange={handleChange}
      options={selectOptions}
      description={selected?.blurb || undefined}
      disabled={disabled}
      size="small"
    />
  );
}

export const CuratedModelSelect = React.memo(
  CuratedModelSelectInner
) as typeof CuratedModelSelectInner;

export default CuratedModelSelect;
