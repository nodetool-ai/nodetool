"use client";
/**
 * The strip above the header. It renders visible on the server and hides
 * itself only after the reader dismisses it, so nothing shifts on hydration
 * for a first-time visitor.
 *
 * Its height is `--announce-h` (globals.css). The header is positioned at that
 * offset and the body is padded by it, so every page's existing clearance for
 * the fixed nav keeps working — dismissing the bar sets the variable to zero
 * and the whole layout closes up.
 */
import React, { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

import { track } from "../lib/analytics";
import { localeOfPath } from "../i18n/routes";
import { ZH_ANNOUNCEMENT } from "../i18n/zh/chrome";
import { JA_ANNOUNCEMENT } from "../i18n/ja/chrome";
import { KO_ANNOUNCEMENT } from "../i18n/ko/chrome";

/** Bump the id when the message changes so a past dismissal does not hide it. */
const ANNOUNCEMENT = {
  id: "cloud-alpha-2026-11",
  text: "NodeTool Cloud is in alpha. Direct films and run workflows in the browser, on your own keys.",
  short: "NodeTool Cloud is in alpha.",
  href: "/cloud",
  cta: "Try it",
  dismiss: "Dismiss announcement",
};

/** The same message on translated pages. */
const TRANSLATED = { zh: ZH_ANNOUNCEMENT, ja: JA_ANNOUNCEMENT, ko: KO_ANNOUNCEMENT };

const STORAGE_KEY = "nodetool:announcement-dismissed";
const DISMISSED_CLASS = "announcement-dismissed";

export default function AnnouncementBar() {
  const [dismissed, setDismissed] = useState(false);
  const locale = localeOfPath(usePathname());
  const copy = locale ? { ...ANNOUNCEMENT, ...TRANSLATED[locale] } : ANNOUNCEMENT;

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Private-mode storage throws. An undismissable bar is the safe failure.
    }
    if (stored === ANNOUNCEMENT.id) {
      document.documentElement.classList.add(DISMISSED_CLASS);
      setDismissed(true);
    }
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    document.documentElement.classList.add(DISMISSED_CLASS);
    try {
      window.localStorage.setItem(STORAGE_KEY, ANNOUNCEMENT.id);
    } catch {
      // See above — dismissal just does not persist.
    }
  }, []);

  if (dismissed) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[60] h-[var(--announce-h)] border-b border-slate-800/60 bg-slate-950/95 backdrop-blur">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-center gap-3 px-10 sm:px-8">
        <p className="truncate text-xs text-slate-300 sm:text-sm">
          <span className="hidden sm:inline">{copy.text}</span>
          <span className="sm:hidden">{copy.short}</span>{" "}
          <a
            href={copy.href}
            onClick={() => track("Cloud CTA", { placement: "announcement" })}
            className="font-semibold text-blue-300 underline underline-offset-2 hover:text-blue-200 focus-ring"
          >
            {copy.cta} →
          </a>
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label={copy.dismiss}
          className="absolute right-3 rounded p-1 text-slate-500 hover:text-slate-200 focus-ring sm:right-6"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
