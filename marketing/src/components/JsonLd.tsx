import React from "react";

/**
 * Renders a JSON-LD <script> block. Server component so the structured data is
 * in the server HTML for crawlers and LLMs (A3). Pass a schema.org object.
 */
export default function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
