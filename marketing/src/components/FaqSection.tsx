import React from "react";
import JsonLd from "./JsonLd";
import { faqPageSchema, type QaPair } from "@/lib/jsonld";

/**
 * A visible FAQ block that emits its own `FAQPage` JSON-LD from the exact
 * items it renders. One array in, one question list on the page, the same
 * question list in the schema — the two cannot drift.
 *
 * Answers are plain text (one short paragraph each). For Markdown answers
 * drawn from `faqEntries.ts`, use `<FaqBlock />` instead.
 */
export type FaqSectionProps = {
  items: readonly QaPair[];
  heading?: string;
  /** Sentence under the heading. */
  intro?: string;
  /** Skip the JSON-LD when the page already emits an FAQPage block. */
  emitSchema?: boolean;
  className?: string;
  id?: string;
};

export default function FaqSection({
  items,
  heading = "Frequently asked questions",
  intro,
  emitSchema = true,
  className = "mx-auto mt-16 max-w-3xl px-6",
  id = "faq",
}: FaqSectionProps) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby={`${id}-title`} className={className} id={id}>
      {emitSchema && <JsonLd data={faqPageSchema(items)} />}
      <h2
        id={`${id}-title`}
        className="text-2xl font-semibold tracking-tight text-white"
      >
        {heading}
      </h2>
      {intro && <p className="mt-3 leading-relaxed text-slate-400">{intro}</p>}
      <dl className="mt-6 space-y-4">
        {items.map((item) => (
          <div
            key={item.question}
            className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-6"
          >
            <dt className="font-semibold text-white">{item.question}</dt>
            <dd className="mt-2 text-sm leading-relaxed text-slate-300">
              {item.answer}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
