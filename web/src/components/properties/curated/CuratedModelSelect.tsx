/**
 * The Studio beginner shell's model control: a plain dropdown over the few
 * curated options for one role, with the selected option's blurb underneath.
 * The shared model selects use this inside the Studio shell, with a provider
 * setup action available alongside the curated choices.
 *
 * The list is narrowed to the models the server sells, and a selection the
 * server no longer sells is replaced with one it does — an operator can tighten
 * the whitelist under a project that already picked something else.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useModelProviderSetup } from "../../../hooks/useModelProviderSetup";
import type { OnboardingCapability } from "../../../stores/ProviderOnboardingStore";
import { SelectField } from "../../ui_primitives";
import type { CuratedOption } from "../../../studio/curatedModels";
import { useSpendableOptions } from "../../../studio/useSpendableModels";

interface CuratedModelSelectProps<T> {
  label: string;
  capability?: OnboardingCapability;
  options: CuratedOption<T>[];
  /** Current selection's option id; anything unknown reads as nothing selected. */
  value: string;
  onChange: (value: T) => void;
  disabled?: boolean;
}

function CuratedModelSelectInner<T>({
  label,
  capability,
  options,
  value,
  onChange,
  disabled
}: CuratedModelSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const onClose = useCallback(() => setOpen(false), []);
  const { openSetup } = useModelProviderSetup({ open, onClose, capability });
  const spendable = useSpendableOptions(options);
  const selectOptions = useMemo(
    () => [...spendable.map((option) => ({ value: option.id, label: option.label })), { value: "__add_providers", label: "Add providers…" }],
    [spendable]
  );
  const selected = useMemo(
    () => spendable.find((option) => option.id === value),
    [spendable, value]
  );
  const handleChange = useCallback(
    (id: string) => {
      if (id === "__add_providers") { openSetup(); return; }
      const picked = spendable.find((option) => option.id === id);
      if (picked) onChange(picked.value);
    },
    [spendable, onChange, openSetup]
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
      open={open}
      onOpen={() => setOpen(true)}
      onClose={onClose}
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
