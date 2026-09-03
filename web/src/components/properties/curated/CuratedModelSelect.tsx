/**
 * The Studio beginner shell's model control: a plain dropdown over the few
 * curated options for one role, with the selected option's blurb underneath.
 * No provider browser, no search, no API keys — the shared model selects swap
 * themselves for this inside the Studio shell.
 *
 * The list is narrowed to the models the server sells, and a selection the
 * server no longer sells is replaced with one it does — an operator can tighten
 * the whitelist under a project that already picked something else.
 */

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { SelectField } from "../../ui_primitives";
import type { CuratedOption } from "../../../studio/curatedModels";
import { useSpendableOptions } from "../../../studio/useSpendableModels";

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
  const spendable = useSpendableOptions(options);
  const selectOptions = useMemo(
    () => spendable.map((option) => ({ value: option.id, label: option.label })),
    [spendable]
  );
  const selected = useMemo(
    () => spendable.find((option) => option.id === value),
    [spendable, value]
  );
  const handleChange = useCallback(
    (id: string) => {
      const picked = spendable.find((option) => option.id === id);
      if (picked) onChange(picked.value);
    },
    [spendable, onChange]
  );

  // Correct an unavailable selection once per fallback. The ref is what makes
  // it once: a parent that ignores the change (a read-only surface) would
  // otherwise be told again on every render.
  const corrected = useRef<string | null>(null);
  const fallback = spendable[0];
  useEffect(() => {
    if (selected || !fallback) return;
    if (corrected.current === fallback.id) return;
    corrected.current = fallback.id;
    onChange(fallback.value);
  }, [selected, fallback, onChange]);

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
