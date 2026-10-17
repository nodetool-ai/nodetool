import { useEffect, useRef, useState } from 'react';
import type * as React from 'react';

/** Inline name well replacing window.prompt(): Enter commits, Escape/blur
 * cancels. Auto-focuses and selects so typing immediately replaces the
 * seed text. The input is excluded from note-playing by the same
 * `closest('input, ...')` guard the global key handler already uses. */
export function InlineNameField({ initial, onCommit, onCancel }: {
  initial: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const committed = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = () => {
    committed.current = true;
    const name = value.trim();
    if (name) onCommit(name);
    else onCancel();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  };

  return (
    <input
      ref={ref}
      className="sq-lib-namefield"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => { if (!committed.current) onCancel(); }}
    />
  );
}
