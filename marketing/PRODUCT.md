# Product

## Register

brand

## Users

Primary: **small production teams doing paid, repeated work** — performance and social teams shipping ad variants weekly, catalogue teams with more SKUs than shoot days, studios re-releasing a talk into another market. They arrive from a closed AI studio whose credits and model list they have outgrown, and they judge the product in the first ten seconds by whether it looks capable and whether it feels like it's on their side. The **solo filmmaker** making one trailer is the on-ramp: they arrive through the trailer recipe, pay little, and bring the team they work with. [NARRATIVE.md § Audience](NARRATIVE.md#audience) has the reasoning.

Secondary tracks (each with its own surface, not the homepage's first voice): developers (`/developers` — CLI, API, self-hosting), agent builders (`/agents`), and business/teams evaluating cost, ownership, and deployment.

## Product Purpose

NodeTool is an **open creative AI workspace**: one canvas where every major model from every major provider is a node, called with the user's own API keys (BYOK). Users pay providers directly — no credits, no markup, no curated roster — and when a new model ships they swap one node and they're on it the same day. It's open source and runs anywhere (local-first or self-hosted).

Success looks like a creator downloading it, wiring their first multi-model workflow within minutes, and feeling the difference from credit-gated competitors: this one is fast, capable, and theirs.

## Brand Personality

**A creative studio that behaves like a pro tool.** Three words: *capable, open, vivid.*

The voice is a senior technical director: it shows the canvas and the work rather than over-explaining, and it respects the reader's intelligence. Underneath the studio confidence runs a current of honesty: BYOK, no markup, you own it. That transparency is substance, not a slogan, so it should read as quiet fact, not as a pitch. Aspirational but never breathless.

Voice rules, messaging pillars, and the product lexicon live in [docs/BRAND.md](../docs/BRAND.md). This section covers how the brand feels; that file covers what it says.

## Anti-references

- **Generic SaaS / template.** No cream backgrounds, no identical icon-heading-text card grids repeated down the page, no hero-metric template (big number + small label + gradient), no AI-slop landing aesthetic.
- **Enterprise / corporate.** No stiff navy-and-gray, no stock photography, no jargon, no IBM/Salesforce stiffness.
- **Crypto / hype.** No neon-on-black, no gradient overload, no breathless "revolutionary" copy. The product does the work; let the output say so.

## Design Principles

1. **Show the work.** The canvas, the nodes, real product screenshots carry the message. Lead with what the tool makes possible, not adjectives about it.
2. **Honesty as a feature.** "Your keys, your canvas, pay providers directly" is a differentiator. State it plainly and let it land without overselling.
3. **Studio confidence.** Vivid, committed, capable. Match the visual ambition to a pro creative tool, not a generic SaaS funnel. Pragmatic, never hyperbolic: the efficiency is the story, not the adjectives.
4. **Creators first.** The homepage speaks to makers. Technical depth and business framing live on their own tracks, reachable but not crowding the front door.
5. **Earn every section.** No filler, no repeated card grids, no restated headings. Each section advances a distinct reason to download.

## Accessibility & Inclusion

Target WCAG 2.1 AA. The site is dark-themed: hold body text to AA contrast against dark slate backgrounds (the `text-slate-400` on dark surfaces is a known risk area — verify against AA). Respect `prefers-reduced-motion` for the fly-in reveals, parallax, and Framer Motion entrances. Don't encode meaning in color alone (the multi-hue accent system needs text/icon backup). Keep focus states visible on dark backgrounds.
