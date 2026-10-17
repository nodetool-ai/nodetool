import React from "react";
import JsonLd from "./JsonLd";
import { routeUpdated } from "@/data/contentDates";
import { formatDate } from "@/data/blogEntries";

/**
 * A visible "Updated" line plus WebPage dateModified, from the commit day in
 * contentDates.generated.ts. Renders nothing for a route without a date.
 */
export default function PageUpdated({
  route,
  className = "mt-6 text-sm text-slate-400"
}: {
  route: string;
  className?: string;
}) {
  const date = routeUpdated(route);
  if (!date) {
    return null;
  }
  return (
    <>
      <p className={className}>
        Updated <time dateTime={date}>{formatDate(date)}</time>
      </p>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          url: `https://nodetool.ai${route}`,
          dateModified: date
        }}
      />
    </>
  );
}
