import React, { useCallback, useEffect, useState } from "react";
import { TextInput, Text } from "../ui_primitives";

interface NumberSettingProps {
  label: string;
  description: React.ReactNode;
  /** The stored value. */
  value: number;
  /** Called with the clamped number once the field is committed. */
  onCommit: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  fallback: number;
  disabled?: boolean;
  id?: string;
}

/**
 * A numeric setting field that commits on blur or Enter.
 *
 * Writing every keystroke straight to the store makes the field unusable: an
 * empty field reads as 0, the store replaces 0 with its default, and the
 * default reappears under the cursor before the next digit is typed. The
 * field therefore holds the raw string while it is being edited and clamps it
 * once, on commit.
 */
export const NumberSetting = React.memo(function NumberSetting({
  label,
  description,
  value,
  onCommit,
  min,
  max,
  step,
  fallback,
  disabled,
  id
}: NumberSettingProps) {
  const [local, setLocal] = useState<string>(String(value));
  useEffect(() => {
    setLocal(String(value));
  }, [value]);

  const commit = useCallback(() => {
    const clamped = Math.max(min, Math.min(max, Number(local) || fallback));
    setLocal(String(clamped));
    if (clamped !== value) {
      onCommit(clamped);
    }
  }, [local, min, max, fallback, value, onCommit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter") {
        commit();
      }
    },
    [commit]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setLocal(e.target.value),
    []
  );

  return (
    <>
      <TextInput
        type="number"
        autoComplete="off"
        slotProps={{ htmlInput: { min, max, step } }}
        id={id}
        label={label}
        value={local}
        onChange={handleChange}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        variant="standard"
        size="small"
        disabled={disabled}
      />
      <Text className="description">{description}</Text>
    </>
  );
});

export default NumberSetting;
