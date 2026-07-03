# Roadmap: GTM Mode

> _Written 2026-07-03._ This is the operating plan for shifting NodeTool from build mode to
> go-to-market mode. Product vision lives in [MANIFESTO.md](MANIFESTO.md); positioning and voice in
> [marketing/PRODUCT.md](marketing/PRODUCT.md); search strategy in
> [docs/SEO_STRATEGY.md](docs/SEO_STRATEGY.md). Update this file when a phase gate passes or a bet
> changes.

## Where we are

The product surface is broad and shipping: node canvas, video timeline, sketch editor, agent
system, CLI/server on npm, desktop builds for macOS/Windows/Linux, mobile app, Chrome extension,
61 example workflows, a docs site, and a marketing site with `/vs/*` comparison pages.

Distribution is not. Search Console (2026-07-02 audit): 939 clicks / 48.2k impressions, 77% of
visible query clicks branded, non-branded CTR 1.23%, US position 12.5 vs ~7 elsewhere. Docs take
39% of impressions at 0.4% CTR. We have a product that outbuilds its funnel.

GTM mode means the constraint flips: for the next three quarters, distribution work outranks new
product surface. Product changes earn a slot by removing a funnel blocker, not by adding
capability.

## Positioning

**The open creative AI workspace.** One canvas, every major model, your keys, provider prices,
AGPL. The sharpest wedge right now is the Weavy vacuum: Figma acquired the closed-source
incumbent, and every Weavy user is re-evaluating. Secondary wedges: "ComfyUI, but usable beyond
Stable Diffusion" and "n8n for creative work". Each wedge gets its own landing page and its own
message; the homepage stays creator-first per [marketing/PRODUCT.md](marketing/PRODUCT.md).

## North-star metric

**Weekly active workflow runners** (distinct installs that execute ≥1 workflow in a week).
Funnel stages we instrument and report weekly:

1. Site visit → download click
2. Download → first app open
3. First open → first workflow run (**activation** — the metric Phase 1 exists to move)
4. First run → run in week 2 (**retention**)

Instrumentation is a Phase 1 deliverable: anonymous, opt-out, counts-only telemetry that respects
the privacy promise (no workflow content, no prompts, no keys — event names and counts only, with
the schema published in the docs).

## Phase 1 — Activation (now → Sep 2026)

Goal: a curious downloader reaches a successful first workflow run in under 10 minutes, and we can
see it in the numbers. Gate to Phase 2: activation rate measured and ≥40%, or three consecutive
weeks of improvement.

### Product (funnel blockers only)

- **First-run experience.** One default template opens on first launch, pre-wired, runnable with
  either a free local model or a single pasted key. Time-to-first-output is the design target.
- **Template gallery in-app.** The 61 examples surfaced at launch, filtered by "works without any
  API key" first. Templates are the activation vehicle; treat broken or stale examples as P1 bugs.
- **Key setup that doesn't stall.** Provider key entry with a live validation check and a direct
  link to each provider's key page. A failed first model call must say which key is missing and
  where to get it.
- **Crash and error telemetry.** We cannot fix drop-off we cannot see.

### Marketing

- **Launch beats.** Show HN, Product Hunt, and a Weavy-switcher post, spaced 2–3 weeks apart, each
  anchored to a real release. The US position gap (§0.3 of the SEO audit) says authority is the
  bottleneck; launches and the backlinks they earn are the fix.
- **Demo videos.** The `demo/` Remotion harness exists — ship one 60–90s video per editor surface
  (canvas, timeline, sketch) for the site, YouTube, and launch posts.
- **Comparison pages watched weekly.** `/vs/langflow`, `/vs/n8n`, `/vs/flowise`, `/vs/dify`
  shipped 07-01/07-02 with no data yet. Add `/vs/comfyui` and `/vs/weavy` — the two with real
  switcher intent.
- **Directory sweep.** awesome-lists, alternativeto, open-source directories, AI tool roundups.
  One-time effort, compounding backlinks.

## Phase 2 — Distribution (Oct → Dec 2026)

Goal: non-branded traffic and community sharing become the top acquisition channels. Gate to
Phase 3: ≥50% of new downloads from non-branded search plus community referral.

- **Programmatic SEO build-out.** Execute [docs/SEO_PROGRAMMATIC.md](docs/SEO_PROGRAMMATIC.md):
  template pages, model and model-vs-model pages, the keyword landing matrix, the
  comparison/alternatives mesh. The template engine on the marketing site (merged 07-02) is the
  foundation.
- **Community hub.** Workflow sharing with one-click import (the `.nodetool` bundle format already
  ships). Every shared workflow is a landing page; every landing page is a template; every
  template is an activation path. This is the flywheel and the largest single bet of the phase.
- **Creator program.** 10–20 creators seeded with support and co-marketing. Their published
  workflows and videos are the proof the homepage can't fake.
- **AI-assistant surface.** The Search Console export shows LLM-driven evaluation queries already
  landing on us. Keep `llms.txt`, JSON-LD, and the docs' answer-shaped pages current so NodeTool
  survives the "which is free? are any open source?" follow-ups.

## Phase 3 — Revenue (2027 H1)

Goal: first paying customers without breaking the BYOK/open-source promise. Decisions here are
gated on Phase 2 data, not made now. Candidate models, in current order of preference:

1. **Hosted NodeTool (Cloud).** The `/cloud` page and Docker/RunPod deployment path exist; the
   product is "your workflows, running without the desktop install", priced on hosting, never on
   model markup.
2. **Team features.** Shared workflow libraries, roles, audit — sold to the studios and teams that
   the creator program surfaces.
3. **Managed GPU workers.** Metered convenience on top of the existing RunPod/Vast worker support.

Explicitly out: model-call markup, credit systems, and closing any currently open code. Those
break the positioning that makes the rest of this plan work.

## Standing channels

| Channel | Cadence | Note |
| :--- | :--- | :--- |
| Discord | daily presence | Support answers become docs pages |
| GitHub releases | every 2–4 weeks | Each release is a content beat, not just a tag |
| Search Console review | weekly | Track `/vs/*` and non-branded clusters per SEO audit §0 |
| Short-form video | 1/week from Phase 1 | Cut from the Remotion demo harness |
| X / Bluesky / Reddit | with each release | r/StableDiffusion, r/comfyui, r/LocalLLaMA |

## Risks

- **Activation stays low despite templates.** Then the problem is deeper than onboarding (install
  size, model download friction, hardware floor) and Phase 1 extends before any Phase 2 spend.
- **Telemetry backlash.** Mitigated by opt-out visibility at first run, counts-only schema,
  published in docs. If the community pushes back anyway, switch to opt-in and accept blurrier
  numbers.
- **Weavy window closes.** Figma ships a successor and switcher intent evaporates. The ComfyUI and
  n8n wedges don't depend on it.
- **One-person marketing bandwidth.** The phases are sequenced so nothing requires parallel
  campaigns; if a beat slips, drop the beat, not the weekly metric review.

## What we say no to (through 2026)

- New editor surfaces or modalities. The three that exist need users, not siblings.
- Enterprise features ahead of Phase 3 data.
- Any pricing that meters model calls.
- Growth tactics that conflict with [docs/WRITING_STYLE.md](docs/WRITING_STYLE.md) or the
  manifesto's privacy promise.
