import React from "react";
import type { PlausibleProps, TrackEvent } from "../lib/analytics";
import TrackedLink from "./TrackedLink";

interface MarketingClosingActionProps {
  headingId: string;
  title: string;
  body: string;
  primaryAction: React.ReactNode;
  secondaryAction: {
    href: string;
    label: string;
    external?: boolean;
    event?: TrackEvent;
    eventProps?: PlausibleProps;
  };
}

export default function MarketingClosingAction({
  headingId,
  title,
  body,
  primaryAction,
  secondaryAction,
}: MarketingClosingActionProps) {
  const linkProps = {
    href: secondaryAction.href,
    ...(secondaryAction.external
      ? { target: "_blank", rel: "noopener noreferrer" }
      : {}),
    className:
      "inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/60 px-6 py-3 text-sm font-semibold text-slate-100 transition-colors hover:border-slate-500 hover:bg-slate-800/70 focus-ring",
  };
  return (
    <section aria-labelledby={headingId} className="rhythm-section">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2
          id={headingId}
          className="text-3xl font-semibold tracking-tight text-white md:text-5xl"
        >
          {title}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-slate-300">
          {body}
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {primaryAction}
          {secondaryAction.event ? (
            <TrackedLink {...linkProps} event={secondaryAction.event} eventProps={secondaryAction.eventProps}>
              {secondaryAction.label}
            </TrackedLink>
          ) : (
            <a {...linkProps}>{secondaryAction.label}</a>
          )}
        </div>
      </div>
    </section>
  );
}
