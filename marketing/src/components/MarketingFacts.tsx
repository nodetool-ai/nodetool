import React from "react";

export interface MarketingFact {
  term: string;
  description: string;
}

interface MarketingFactsProps {
  items: MarketingFact[];
}

export default function MarketingFacts({ items }: MarketingFactsProps) {
  return (
    <dl className="divide-y divide-slate-800 border-y border-slate-800">
      {items.map((item) => (
        <div
          key={item.term}
          className="grid gap-2 py-5 sm:grid-cols-[minmax(10rem,0.7fr)_minmax(0,1.3fr)] sm:gap-8"
        >
          <dt className="text-sm font-semibold text-white">{item.term}</dt>
          <dd className="text-sm leading-relaxed text-slate-300">
            {item.description}
          </dd>
        </div>
      ))}
    </dl>
  );
}
