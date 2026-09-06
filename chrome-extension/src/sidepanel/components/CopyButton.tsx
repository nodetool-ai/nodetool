/**
 * Copy-to-clipboard affordance for a code block or a tool result.
 *
 * The side panel is narrow and its `<pre>` blocks scroll, so selecting text by
 * hand is awkward — the button copies the whole value instead.
 */

import { useEffect, useRef, useState } from "react";

import { CheckIcon, CopyIcon } from "./Icons.js";

/** How long the button stays in its confirmed state (ms). */
const CONFIRM_MS = 1200;

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // A denied clipboard permission is not worth a banner; the button just
      // does not confirm.
      return;
    }
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), CONFIRM_MS);
  }

  return (
    <button
      type="button"
      className="icon-button icon-button--ghost"
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      onClick={() => void copy()}
    >
      {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
    </button>
  );
}
