import React from "react";
import { ArrowUpRight } from "lucide-react";

export type ReadMoreLink = { label: string; href: string };

/**
 * The "Read more" link list that closes a landing page: related pages on
 * nodetool.ai and the guides on docs.nodetool.ai. One shared markup so every
 * page links out to the docs and its neighbours the same way.
 */
export default function ReadMoreLinks({
  id,
  links,
  heading = "Read more",
  className = "mt-16 max-w-3xl",
}: {
  id: string;
  links: readonly ReadMoreLink[];
  heading?: string;
  className?: string;
}) {
  const titleId = `${id}-title`;
  return (
    <nav aria-labelledby={titleId} className={className}>
      <h2 id={titleId} className="text-xl font-semibold text-white">
        {heading}
      </h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {links.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              className="focus-ring inline-flex items-center gap-1 rounded text-cyan-200 hover:text-cyan-100"
            >
              {link.label}
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
