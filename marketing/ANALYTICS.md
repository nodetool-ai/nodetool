# Search acquisition and funnel measurement

Website actions measure intent. An installer click does not establish that
someone installed Studio or completed a project.

## Event meanings

The [event registry](src/lib/analytics.ts) supplies a bounded `page` label and
`landing_page` label. Starter download links carry allowlisted `from` and
`starter` parameters. Unknown values are ignored. No query strings, personal
details, cookies, or browser storage are used for this context.

| Event | Trigger | Meaning |
|---|---|---|
| `Download CTA` | [Shared download button](src/app/SmartDownloadButton.tsx) | Opens the installer picker. Includes OS, placement, and the selected starter when supplied. |
| `Download` | [Installer picker](src/components/DownloadPanel.tsx) | Opens a release asset found in the GitHub release response. Includes OS and installer placement. |
| `Browse Releases` | Missing-asset fallback or release-notes link | Opens the GitHub releases page. It is separate from an installer click. |
| `Cloud CTA` | [Announcement](src/components/AnnouncementBar.tsx) | Opens the Cloud information page. |
| `Try Cloud` | [Cloud primary actions](src/app/cloud/page.tsx), the homepage closing action, the pricing Cloud plan, or the recipes page | Enters the hosted app. Includes placement. |
| `Open Starter` | Starter inspection link on a landing page or download page | Opens a specific workflow's template page. |
| `View Demo` | [Demo player](src/components/HeroDemoPlayer.tsx) after an explicit play or fullscreen request succeeds | Manual engagement. Autoplay, visibility, and pause do not emit this event. |
| `Open Template` | Template cards on the catalog and related-template lists, and the model page's template link | Opens a template page. Includes the `template` slug and placement. |
| `Open Recipe` | [Recipe cards](src/components/RecipeCard.tsx) and recipe links on template pages | Opens a recipe page. Includes the `recipe` slug and placement. |
| `Recipe Step` | A step selected in the [recipe guide](src/components/RecipeGuide.tsx) | Manual engagement with a guided step. Includes the recipe and 1-based `step`. Autoplay does not emit this event. |
| `Copy Brief` | Successful copy of a recipe's example brief or script | The visitor took the example text to try. Includes the recipe. |
| `Copy Install Command` | Successful copy of the [MCP install command](src/components/agents/McpInstallCommand.tsx) | Agent-integration intent. Includes placement. |
| `Star GitHub`, `Open Docs`, `Join Discord` | Header, footer, community section, and closing actions on the agents, developers, template, and solution pages | Opens the repository, documentation, or Discord. Includes placement where the link sets one. |
| `404` | The [not-found page](src/app/not-found.tsx) | A missing path was requested. Includes the requested `path` only, for broken-link triage in A4. |

`landing_page` describes the source carried by a starter download link, or the
current bounded page label when no source is supplied. It is not persistent
session attribution across arbitrary navigation. Template routes use the
`template` label, recipe routes use `recipe`, and other routes use `other`.
The pricing, agents, developers, templates, and recipes index pages have their
own labels. Events on those pages reported `other` before that change.

The [site layout](src/app/layout.tsx) also loads Plausible's automatic outbound
link and file-download events. Do not add automatic and custom events together
to count distinct people or downloads. Analytics failure must not block an
action.

The meanings of `Download` and `Try Cloud` are narrower than before: releases
browsing and Cloud information visits have separate goals. Split comparisons at
the deployment of this change. Preserve the event names for the steps they
still represent.

## Search landing pages

[Starter instructions](src/data/searchStarters.ts) are tied to templates that
ship with Studio. [SearchStarter](src/components/SearchStarter.tsx) exposes the
provider requirements and inspection link. [DownloadStarter](src/components/DownloadStarter.tsx)
retains those instructions after the download CTA.

| Landing page | Starter |
|---|---|
| ComfyUI, Leonardo AI, and Recraft alternatives, and node-based AI guide | Generate then Upscale a Poster |
| Figma Weave, OpenArt, Midjourney, and Adobe Firefly alternatives | Write the Prompt, Then Make the Image |
| Movie-poster use case and Ideogram alternative | Movie Posters |
| Higgsfield, LTX Studio, Kling AI, Pika, Luma Dream Machine, PixVerse, and Dreamina alternatives | Movie Trailer Generator |
| Google Flow, Artlist Studio, Invideo, Katalist, Storyboarder.ai, Story.com, Mootion, and Moonvalley Marey alternatives | Movie Trailer Generator |

The trailer starter describes a one-shot first test because image and video
calls cost money. No starter promises identical gallery output. New comparison
records link to official capability and pricing sources. The comparison mesh,
sitemap, and discovery catalog derive from the same records.

## Measurement plan

1. **A1 — Verify deployed goals.** Create or verify the exact event names in
   Plausible. Exercise one action at a time, inspect its request properties,
   then verify its matching goal. Record the deployment time and exclude
   validation events from traffic comparisons.
2. **A2 — Compare landing-page outcomes.** Use daily page and query exports
   for the listed landing pages. Track impressions, clicks, CTR, download
   intent, installer clicks, and Cloud entry separately. Compare equal windows
   around a successful deployment, excluding its day. Changes are observed
   associations unless an experiment establishes causality.
3. **A3 — Define first success.** A first successful project means a workflow
   completed with a nonempty declared output that the creator inspected.
   Verify it from a product run and its output, not a website click. Studio
   does not collect product analytics under the [privacy policy](src/app/privacy/page.tsx).
   Website-to-activation attribution requires a separate product and privacy
   decision. Do not introduce an account identifier to join these events.
4. **A4 — Triage indexing by URL.** Export affected Search Console URLs and
   separate marketing and documentation hosts. Review page families and
   reasons. Redirect a retired URL only when a relevant successor exists.
   Preserve intentional noindex, canonicals, and valid redirects. Check stale
   internal links and accidental exclusions on the acquisition pages.
5. **A5 — Keep the homepage stable during measurement.** Use the landing-page
   cohort and deployment evidence before changing the homepage narrative.
   Treat AI-feature impressions as part of overall Search reporting, and keep
   AI-assistant referral traffic separate.

## Regression verification

[Download regressions](tests/e2e/download.spec.ts) cover desktop and mobile
platform labels. [Acquisition regressions](tests/e2e/search-acquisition.spec.ts)
cover relevant starter links, installer attribution, unknown-parameter
rejection, releases fallback, Cloud goal separation, manual demo events, and
the template, recipe, install-command, pricing Cloud, and 404 goals.
Browser scenarios use representative navigator values, not physical devices.

Run from `marketing/`:

```bash
npm run test:e2e -- download.spec.ts search-acquisition.spec.ts --project=chromium --workers=1
```

On Linux, if Chromium crashes while rendering blur effects and `/dev/shm` has
enough space, run the same command with `MARKETING_USE_SHARED_MEMORY=true`.
This changes Chromium's shared-memory location without changing page styles.
