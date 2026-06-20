# Marketing Site — Comprehensive Improvement Plan

_Last updated: 2026-06-20_

A prioritized plan to improve `marketing/` (the `nodetool.ai` site: Next.js 15 App
Router + Tailwind 3, deployed via `@opennextjs/cloudflare` to Cloudflare Workers).
It is grounded in an audit of the current code, not a greenfield redesign — the
"Midnight Studio" design language in [`DESIGN.md`](DESIGN.md) and the creators-first
positioning in [`PRODUCT.md`](PRODUCT.md) are kept; this plan closes the gap between
those intentions and what actually ships.

---

## 1. Current state (audit summary)

**What's good:** Strong, current positioning ("the open creative AI workspace —
every model, your keys, pay providers directly"); a coherent documented design
system; per-page `metadata` + canonical on every route; rich JSON-LD
(SoftwareApplication, Organization, FAQPage); sitemap/robots complete; legal pages
exist; honest copy that names real models and providers.

**What's holding it back (the headline problems):**

| # | Problem | Why it matters |
|---|---------|----------------|
| P1 | **~14 homepage sections render `dynamic(ssr:false)`** — they are absent from the server HTML. The compensation is a `.sr-only-seo` block positioned off-screen (`left:-9999px`) containing a **second, hidden `<h1>`**. | Crawlers/LLMs see an near-empty shell + a hidden keyword block (borderline cloaking). The real product story is not in the served HTML. |
| P2 | **~50 MB of unoptimized media in `/public`** (`demo.mp4` 15 MB, `sora.mp4` 11 MB, `disaster_girl.mp4` 5 MB; several 1.5–2.8 MB PNGs). Hero screenshots use raw `<img>`; `images.unoptimized: true`. | Fails Core Web Vitals (LCP/FCP) on mobile; high bounce; wasted Cloudflare egress. |
| P3 | **5 persona pages are siloed microsites** (`/studio`, `/cloud`, `/agents`, `/developers`, `/creatives`) with duplicated, inconsistent nav/footer and almost no cross-linking. | Broken user journeys; diluted internal link equity; ~1000+ duplicated lines to maintain. |
| P4 | **No conversion instrumentation.** Plausible is loaded but there are **zero event tags** on any CTA/download. `SmartDownloadButton` also hardcodes a stale fallback version and assumes **arm64-only macOS** (Intel Mac → broken link). | We can't measure or improve download conversion; some users get a dead download link. |
| P5 | **Design-system drift.** Legacy amber→orange wordmark in nav (banned by DESIGN.md), gradient-clipped section headings across many sections (violates the One-Gradient-Span rule), inconsistent accent colors. | The page contradicts its own documented system; reads less "pro studio." |
| P6 | **Accessibility gaps.** Body text at `text-slate-400/500` on near-black (AA-borderline/failing), hero background glows animate without a `prefers-reduced-motion` guard, generic/duplicated headings, inconsistent focus treatment. | WCAG 2.1 AA is a stated target in PRODUCT.md; currently unmet in places. |
| P7 | **Missing growth surfaces & stale docs.** No pricing, blog/changelog, or comparison (vs ComfyUI / vs Weavy) pages. Planning docs `CONTENT_CHANGES.md`, `VISUAL_CHANGES.md`, `SCREENSHOTS.md` describe an **abandoned** "visual programming tool for developers" positioning and now actively mislead. | No SEO/long-tail capture, no top-of-funnel content, no decision-stage pages; contributors get conflicting guidance. |
| P8 | **No tests, no CI for the marketing package.** | Broken links, missing metadata, and regressions ship silently. |

---

## 2. Goals & success metrics

| Goal | Metric | Baseline | Target |
|------|--------|----------|--------|
| Make the product story crawlable | % of marketing copy in server HTML | low (hero-only) | ~100% of above-the-fold + key sections SSR'd; remove hidden duplicate H1 |
| Pass Core Web Vitals on mobile | LCP (mobile, 4G) | likely >3 s | < 2.5 s |
| Cut page weight | Homepage transfer (first load) | ~tens of MB | < 3 MB initial, lazy media beyond |
| Measure conversion | Download/CTA events in Plausible | 0 tagged | All primary CTAs tagged; funnel visible |
| Unify IA | Shared header/footer; every persona reachable in ≤1 click | siloed | single shared nav/footer across all routes |
| Design conformance | DESIGN.md violations | many | 0 banned patterns (amber wordmark, gradient headings) |
| Accessibility | WCAG 2.1 AA automated pass (axe) | unknown/failing | 0 critical axe violations; manual AA spot-check |
| Quality gate | CI on `marketing/` | none | typecheck + lint + link-check + Lighthouse budget on PR |

---

## 3. Workstreams

Each task is tagged **[impact / effort]** (H/M/L) to support sequencing.

### A. Rendering & SEO architecture _(addresses P1)_

- **A1 — Server-render the homepage sections.** [H/M] Convert sections that don't
  need browser-only APIs from `dynamic(ssr:false)` to normal server components (or
  `dynamic` with `ssr:true`). Only genuinely client-only widgets must stay
  `ssr:false`: ReactFlow previews (`SimpleReactFlowWrapper`, `WorkflowOverlay`,
  `NodeToolHero` interactive bits, `AgentsGraphHero`), `wavesurfer.js` audio, and
  anything touching `window` on mount. Everything else (copy, screenshots, feature
  grids, comparison, ownership, deploy) should be in the served HTML.
- **A2 — Retire the hidden-H1 SEO hack.** [H/L] Once real copy is SSR'd, delete the
  off-screen `.sr-only-seo` duplicate `<h1>` in `SeoHeroContent.tsx`. Keep exactly
  one visible `<h1>` per page. (Hidden keyword blocks risk being discounted or
  flagged; SSR'd visible copy is strictly better for both SEO and LLM citation.)
- **A3 — Per-page JSON-LD.** [M/L] Add `BreadcrumbList` site-wide; `SoftwareSourceCode`
  on `/developers`; per-edition `SoftwareApplication`/`Offer` on `/studio` & `/cloud`;
  `VideoObject` for the homepage demo video (improves rich results + LLM grounding).
- **A4 — Apply the same SSR treatment to persona pages.** [M/M] `/studio`, `/cloud`,
  `/agents`, `/developers` mirror the homepage's `ssr:false` pattern; `/creatives`
  already renders inline (use it as the template).
- **A5 — Distinct `og:image` per route.** [M/L] Generate per-page Open Graph images
  (edition/persona-specific) instead of a single `/preview.png`, ideally via Next
  `opengraph-image` route handlers.

### B. Performance & asset weight _(addresses P2)_

- **B1 — Compress & re-encode video.** [H/L] Re-encode `demo.mp4` (15 MB) and
  `sora.mp4` (11 MB) to ~2–4 MB H.264/AV1 at sane bitrate; add `poster` frames;
  `preload="none"`; play on interaction. Consider hosting heavy video on a CDN/stream
  rather than the Worker bundle.
- **B2 — Convert large PNGs to WebP/AVIF.** [H/L] `screen2.png` (2.8 MB), `chat.png`
  /`screen_chat.png` (2.1 MB), `creatives_workflow.png` (1.6 MB), `screen_canvas.png`
  (1.5 MB), `cat.png` (1.4 MB), `screen_assets.png` (2.1 MB) → WebP/AVIF at display
  resolution. Convert `imagegen.gif` (476 KB) to MP4/WebM.
- **B3 — Image pipeline on Cloudflare.** [M/M] `images.unoptimized: true` is required
  because the default Next optimizer doesn't run on Workers — so either (a) wire up
  **Cloudflare Images / Image Resizing** and a custom loader, or (b) pre-generate
  responsive sizes at build time. Replace raw `<img>` with `next/image` (+ width/height
  + `loading="lazy"` below the fold) once a loader exists.
- **B4 — Lazy-load below-the-fold media and the ReactFlow/wavesurfer bundles.** [M/L]
  Keep heavy interactive widgets behind intersection/`dynamic` so they don't block
  first paint.
- **B5 — Set a performance budget** in CI (Lighthouse CI assertions: LCP, TBT, total
  bytes). Fail the PR if exceeded.

### C. Information architecture & navigation _(addresses P3)_

- **C1 — Extract a shared `<SiteHeader>` and `<SiteFooter>`.** [H/M] One nav, one
  footer, used by the homepage and all persona/legal pages. Eliminates the duplicated
  per-page nav blocks and their drift.
- **C2 — Coherent global nav.** [H/L] Surface the real top-level IA: Product
  (Studio / Cloud), Solutions (Creatives / Agents / Developers), Pricing, Docs,
  Community, GitHub. Every persona reachable in one click from any page.
- **C3 — Cross-link personas + editions** in-body (e.g. `/agents` → "built on
  Studio/Cloud", `/developers` → "see it for creatives"), with consistent CTAs.
- **C4 — Footer link hygiene.** [L/L] Legal pages cross-link each other; footer is
  identical everywhere; add Pricing/Blog once they exist.

### D. Conversion & analytics _(addresses P4)_

- **D1 — Tag every primary CTA in Plausible.** [H/L] `plausible('Download', {os})`,
  `plausible('Star GitHub')`, `plausible('Try Cloud')`, `plausible('Contact')`, etc.
  Define a small typed `track()` helper so events are consistent.
- **D2 — Fix `SmartDownloadButton`.** [H/M] (a) Don't hardcode a stale fallback
  version — read latest from a build-time/edge-cached source, not an unauthenticated
  client `api.github.com` call on every load. (b) Detect **Apple Silicon vs Intel**
  and offer the correct macOS artifact (current code links arm64-only → broken for
  Intel). (c) Provide an "all platforms / other downloads" affordance.
- **D3 — Cache GitHub star count server-side.** [M/L] Replace the per-visitor
  `api.github.com` fetch on the homepage with an ISR/edge-cached value (rate-limit and
  latency risk today).
- **D4 — Add a Cloud waitlist/interest capture.** [M/M] `/cloud` links straight to the
  alpha app with no lead capture; add an email/waitlist form (Formik is already a dep)
  for the alpha → GA funnel.

### E. Design-system conformance _(addresses P5)_

- **E1 — Replace the legacy amber→orange wordmark** (`from-amber-400 to-orange-300`)
  in the nav/mobile menu with solid white/near-white per DESIGN.md §2. [H/L]
- **E2 — Enforce the One-Gradient-Span rule.** [M/M] Remove gradient-clipped section
  headings (`from-blue-400 to-indigo-400`, `from-emerald-400 to-teal-400`, etc.) in
  `FeaturesSection`, `NodeMenuSection`, `ChatUISection`, `VideoGenerationSection`,
  `ModelSupportSection`, `ComparisonSection`, `EditionsCompareSection`. Hero keeps its
  single rose→fuchsia→amber span; everything else is solid white.
- **E3 — Normalize accent usage** (Action Blue `#2563eb` as the one action color;
  other hues only as glows), and the badge/pill system to the blue-glass spec.
- **E4 — Audit the shadcn `ui/Button` (pink→cyan) and `ui/Card` (white) defaults** —
  DESIGN.md bans them; confirm they're unused or replace with glass/blue patterns.

### F. Accessibility (WCAG 2.1 AA) _(addresses P6)_

- **F1 — Body-text contrast.** [H/L] Lift `text-slate-400`/`text-slate-500` used for
  real body copy on dark surfaces to `slate-300`+ where they don't clear 4.5:1.
- **F2 — Guard all motion** with `prefers-reduced-motion` — including the hero/page
  background glow animations that currently animate unconditionally.
- **F3 — Visible, consistent focus** on every interactive element (the `.focus-ring`
  utility exists but isn't applied everywhere; standardize on `:focus-visible`).
- **F4 — Heading hierarchy & alt text.** One `<h1>` per page; descriptive,
  content-specific `alt` on product screenshots (not generic).
- **F5 — Add `axe`/Lighthouse-a11y to CI** so regressions are caught.

### G. Content & messaging _(addresses P7, content side)_

- **G1 — Single source of truth for positioning.** [M/L] Reconcile copy to the
  current "open creative AI workspace / BYOK" line everywhere; eliminate leftover
  "visual programming tool for AI development" framing.
- **G2 — Tighten weak/vague sections.** `ModelManagerSection` ("Hello HuggingFace"),
  `ChatUISection` ("ask in plain English") need specifics. Clarify the
  `VideoGenerationSection` demo (the `sora.mp4` asset implies OpenAI Sora — caption
  the actual model/provider to avoid an implied-capability claim).
- **G3 — Version-stale model names.** [L/L] The frontier-model marquee
  (`ModelSupportSection`) is "perishable by design" — add a lightweight process/source
  so names don't rot, or pull from a single data file.
- **G4 — Prune/repurpose orphaned components** (`ProvidersSection`, `UseCasesSection`,
  `EditionsCompareSection` are not on the homepage; either wire them into a page or
  delete).
- **G5 — Stale-doc cleanup.** Archive or delete `CONTENT_CHANGES.md`,
  `VISUAL_CHANGES.md`, `SCREENSHOTS.md` (they document an abandoned direction). Keep
  `DESIGN.md`, `PRODUCT.md`, `LEGAL_OPEN_ITEMS.md`, and this plan as the live set.

### H. New growth surfaces _(addresses P7, structural side)_

- **H1 — Pricing page.** [H/M] Studio = free/AGPL; Cloud = subscription (BYOK, pay
  providers directly). Even a "Cloud pricing coming soon / alpha" page closes a major
  decision-stage gap and ranks for "nodetool pricing."
- **H2 — Comparison/alternative landing pages.** [H/M] `/vs/comfyui`, `/vs/weavy`
  (and the n8n/LangChain angle) — high-intent SEO the homepage only hints at via
  keywords. Reuse `ComparisonSection` content as full pages with JSON-LD.
- **H3 — Blog / changelog.** [M/M] Top-of-funnel content + release notes (MDX, static).
  Feeds SEO, gives social/Discord something to point at, and supports LLM freshness.
- **H4 — Templates / examples gallery.** [M/M] The repo ships workflow examples and
  `.nodetool` bundles; a gallery ("download this workflow") is a strong activation
  surface. (`page.tsx` already has a commented-out `ExamplesGrid` placeholder.)

### I. Legal & compliance

- **I1 — Work through [`LEGAL_OPEN_ITEMS.md`](LEGAL_OPEN_ITEMS.md)** in its stated
  priority order (Terms §10/§11/§13 rewrite; AI-provider controller/processor
  labelling + AVV refs; DSA Art. 17/20; §8 transfer table; named email/payment
  processors; children age-gate). Coordinate with counsel — not a pure eng task, but
  tracked here so it isn't dropped.

### J. Testing, CI & quality gates _(addresses P8)_

- **J1 — Add a `marketing` CI workflow** (`.github/workflows`): typecheck + `next lint`
  on PRs touching `marketing/`.
- **J2 — Link checker** (internal + external) to catch 404s/dead download links.
- **J3 — Playwright smoke tests:** homepage + each persona renders, primary CTA points
  somewhere valid, download button resolves per-OS, metadata/`<h1>` present.
- **J4 — Lighthouse CI budget** (perf + a11y) wired to PRs (ties to B5/F5).

---

## 4. Phased roadmap

**Phase 0 — Quick wins (days, low risk, high signal)**
- E1 amber wordmark → white · D1 Plausible CTA tagging · D2b macOS arch fix ·
  B1 video compression + posters · F2 reduced-motion guard on hero glows ·
  G5 archive stale docs. Ship as one "polish + instrumentation" PR.

**Phase 1 — Foundations (the structural fixes)**
- A1/A2 SSR the homepage + drop hidden H1 · C1/C2 shared header/footer + global nav ·
  B2/B3 image pipeline · D2a/D3 download+stars data off the client path ·
  J1/J2 CI + link check.

**Phase 2 — Growth surfaces**
- H1 Pricing · H2 comparison/alternative pages · A3/A5 per-page JSON-LD + OG images ·
  D4 Cloud waitlist · A4 SSR persona pages.

**Phase 3 — Depth & polish**
- H3 blog/changelog · H4 templates gallery · E2/E3 full design-system sweep ·
  F1/F3/F4 a11y sweep + J3/J4 Playwright + Lighthouse budgets · G2/G3 copy tightening ·
  I1 legal items with counsel.

---

## 5. Risks, dependencies, non-goals

- **Cloudflare Workers image optimization (B3)** is the trickiest item — the default
  Next optimizer is off by necessity. Decide between Cloudflare Images vs build-time
  responsive generation before committing `next/image` everywhere.
- **SSR conversion (A1)** must preserve the exact visual result; some components were
  likely made `ssr:false` to dodge hydration/`window` issues — convert incrementally
  with visual checks, not in one sweep.
- **Pricing (H1)** depends on the Cloud business model being settled.
- **Legal (I1)** needs counsel sign-off; engineering only wires in the agreed text.
- **Non-goals:** no rebrand, no framework migration, no redesign of the "Midnight
  Studio" language — this plan executes the existing system, it doesn't replace it.

---

## 6. Suggested first PR (Phase 0)

A single, low-risk, high-visibility PR:
1. Nav/mobile wordmark: amber→orange gradient → solid near-white (E1).
2. Add `track()` helper + tag Download / Star / Try-Cloud / Contact CTAs (D1).
3. Fix macOS arch detection in `SmartDownloadButton` + add "other downloads" link (D2b).
4. Guard hero/page background glow animations with `prefers-reduced-motion` (F2).
5. Re-encode `demo.mp4`/`sora.mp4`, add posters + `preload="none"` (B1).
6. Move `CONTENT_CHANGES.md` / `VISUAL_CHANGES.md` / `SCREENSHOTS.md` to an `archive/`
   folder or delete (G5).

Each is independently shippable and reversible, and together they measurably improve
conformance, performance, conversion visibility, and accessibility without touching the
rendering architecture.
