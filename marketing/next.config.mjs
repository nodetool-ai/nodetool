import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  // Inline the (small, ~17 KiB) global CSS into the HTML instead of shipping
  // render-blocking stylesheet requests — Lighthouse mobile measured 480 ms
  // of blocking time on the two CSS files.
  experimental: {
    inlineCss: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.simpleicons.org',
      },
      {
        protocol: 'https',
        hostname: 'openrouter.ai',
      },
      {
        protocol: 'https',
        hostname: 'ml-explore.github.io',
      },
    ],
  },
  rewrites: async () => {
    return [
      {
        source: '/api/:path*',
        destination: 'https://api.nodetool.run/api/:path*',
      },
    ];
  },
  // Slugs retired by the examples catalog revamp (docs/plans/examples-revamp.md,
  // Phase 2): each was merged into another template, so both its /apps/<slug>
  // mini-app page and /templates/<slug> template page must keep resolving —
  // permanent redirects to the absorbing template's pages, which already carry
  // whatever search equity the retired slug had.
  redirects: async () => {
    // The advertising vertical is named after its industry (NARRATIVE.md
    // § Vertical pages); /marketing stays the canonical route.
    const verticalAliases = [
      { source: "/ai-for-ads", destination: "/marketing", permanent: true },
      { source: "/ai-for-advertising", destination: "/marketing", permanent: true },
    ];

    // Small utility templates removed from the catalog. They have no absorbing
    // template, so each page goes to the template index.
    const removedTemplates = [
      'a-campaign-concept-from-a-brief',
      'add-reverb-to-a-voice',
      'batch-a-list',
      'black-and-white-hard',
      'blog-post-to-social-thread',
      'blur-a-channel',
      'blur-an-image',
      'boost-saturation',
      'bullet-points-to-press-release',
      'chunk-a-transcript-for-indexing',
      'conditional-logic-engine',
      'count-a-list',
      'count-to-three-with-a-loop',
      'crop-an-image',
      'crop-then-fit',
      'crush-it-to-8-bits',
      'denoise-footage',
      'does-this-text-mention-the-deadline',
      'draft-answers-for-an-faq',
      'drop-duplicates',
      'drop-the-first-few',
      'emboss-a-still',
      'every-combination',
      'executive-summary-of-a-long-document',
      'extract-the-claims-worth-checking',
      'fade-audio-in-and-out',
      'fade-audio-out',
      'fill-a-template',
      'find-and-replace',
      'find-every-number-in-a-sentence',
      'find-the-edges',
      'fit-an-image',
      'gate-out-the-room-noise',
      'generate-a-silent-bed',
      'inspect-a-clip',
      'inspect-a-clip-s-audio',
      'invert-a-still',
      'keep-only-the-long-lines',
      'keep-only-the-matches',
      'key-out-a-green-screen',
      'last-one-wins',
      'localise-a-product-listing',
      'normalize-a-clip-s-audio',
      'one-tagline-six-markets',
      'pad-a-canvas',
      'picture-in-picture',
      'pitch-a-voice-up',
      'pixelate-a-still',
      'posterize-to-four-bits',
      'pull-a-field-out-of-json-text',
      're-delimit-a-list',
      'read-a-clip-s-frame-rate',
      'redact-and-tidy-a-log-line',
      'redact-email-addresses',
      'reverse-a-clip',
      'reverse-audio',
      'rewrite-this-so-a-customer-understands-it',
      'rotate-footage',
      'seo-title-and-meta-description',
      'sharpen-footage',
      'slice-text',
      'slow-a-clip-without-dropping-pitch',
      'soften-a-plate',
      'solarize-a-still',
      'split-a-channel',
      'split-a-log-into-records',
      'stabilize-handheld',
      'subject-lines-worth-testing',
      'swirl-and-echo',
      'take-the-first-few',
      'take-while-the-numbers-are-small',
      'telephone-voice',
      'themes-across-customer-feedback',
      'tidy-up-messy-text',
      'translate-marketing-copy-to-german',
      'trim-a-blurb-to-length',
      'trim-audio-to-a-range',
      'turn-a-changelog-into-release-notes',
      'turn-a-support-thread-into-a-bug-report',
      'turn-research-notes-into-a-comparison-table',
      'turn-specs-into-product-copy',
      'vignette-a-portrait',
      'warm-up-a-cold-clip',
    ];

    const merges = {
      'agent-google-search': 'research-agent',
      'wikipedia-agent': 'research-agent',
      'youtube-research-agent': 'research-agent',
      'creative-story-ideas': 'prompt-template',
      'learning-path-generator': 'prompt-template',
      'fetch-papers': 'research-paper-summarizer',
      'summarize-audio': 'meeting-transcript-summarizer',
      'youtube-thumbnail-pipeline': 'hook-and-thumbnail-factory',
      'story-to-video-generator': 'movie-trailer-generator',
    };

    // Mini apps stopped being one generated form per template: the shipped set
    // is 11 curated apps (docs/plans/example-apps.md), so every /apps/<template>
    // page below is gone. The site has no /apps route for the curated apps
    // either, so each old page goes to its workflow's template page. The map
    // records which curated app absorbed the template.
    const absorbedByApp = {
      'image-enhance': 'photo-studio',
      'photo-enhancement-suite': 'photo-studio',
      'transcribe-audio': 'meeting-room',
      'meeting-transcript-summarizer': 'meeting-room',
      'concept-art-iteration-board': 'concept-studio',
      'pokemon-maker': 'concept-studio',
      'research-agent': 'research-desk',
      'hacker-news-agent': 'research-desk',
      'summarize-rss': 'research-desk',
      'chat-with-your-documents': 'ask-your-documents',
      'private-assistant': 'ask-your-documents',
      'brand-asset-generator': 'brand-and-social',
      'hook-and-thumbnail-factory': 'brand-and-social',
      'social-media-calendar-filler': 'brand-and-social',
      'product-mockup-generator': 'product-launch-kit',
      'product-video-generator': 'product-launch-kit',
      'script-to-screen': 'film-studio',
      'directed-film-to-timeline': 'film-studio',
      'movie-posters': 'film-studio',
      'flashcard-generator': 'study-buddy',
      'prompt-template': 'study-buddy',
      'data-generator': 'dataset-builder',
      'model-arena': 'model-arena',
    };
    const workflowOnly = [
      'ad-creative-factory',
      'audio-to-image',
      'cold-outreach-co-pilot',
      'color-boost-video',
      'conditional-logic-engine',
      'image-to-audio-story',
      'image-to-video-animation',
      'movie-trailer-generator',
      'music-video-visualizer',
      'podcast-repurposing-studio',
      'research-paper-summarizer',
      'seo-content-engine',
      'workflow-as-a-tool',
    ];

    // These retired templates have no template page of their own.
    const withoutTemplatePage = new Set(['summarize-rss', 'social-media-calendar-filler']);

    // A merged slug resolves to its absorbing template first, so an old link
    // reaches its destination in one hop rather than a chain.
    const appDestination = (slug) => {
      const template = merges[slug] ?? slug;
      return withoutTemplatePage.has(template) ? '/templates' : `/templates/${template}`;
    };
    const retiredApps = [
      ...Object.keys(merges),
      ...Object.keys(absorbedByApp),
      ...workflowOnly,
    ];

    return [
      ...verticalAliases,
      ...removedTemplates.map((slug) => ({
        source: '/templates/' + slug,
        destination: '/templates',
        permanent: true,
      })),
      // The `/vs/<slug>` comparison family is retired (2026-08-10). It and
      // `/alternatives/<slug>` generated from the same `competitors` array, so
      // the two pages competed for one query set and split its equity;
      // `/alternatives` won 11 of the 12 head-to-head pairs, taking 4,817
      // impressions to `/vs`'s 1,117 (docs/SEO_STRATEGY.md § 0.10, finding 3).
      // The head-to-head copy moved onto the alternatives page, so this is a
      // consolidation, not a deletion. Wildcard rather than an enumerated list:
      // every competitor slug resolves under both prefixes, and an unknown slug
      // 404s at the destination exactly as it did at the source.
      { source: "/vs/:slug", destination: "/alternatives/:slug", permanent: true },
      // The positioning plan asks for /compare/vs-<competitor>. That would be a
      // third prefix over the same copy, and the /vs consolidation above is the
      // measurement saying not to: one page per competitor, on the prefix that
      // won. Both spellings of the plan's URL land there.
      { source: "/compare/vs-:slug", destination: "/alternatives/:slug", permanent: true },
      { source: "/compare/:slug", destination: "/alternatives/:slug", permanent: true },
      ...Object.entries(merges).map(([from, to]) => ({
        source: `/templates/${from}`,
        destination: `/templates/${to}`,
        permanent: true,
      })),
      ...retiredApps
        .map((slug) => ({
          source: `/apps/${slug}`,
          destination: appDestination(slug),
          permanent: true,
        })),
      // Any other /apps/<slug>, including the curated app slugs, lands on the
      // template hub. Temporary, so a future /apps route can take it back. The
      // pattern excludes dots so images under public/apps/ still serve.
      { source: '/apps/:slug([a-z0-9-]+)', destination: '/templates', permanent: false },
      // The old /apps hub still ranks for "ai mini apps" searches.
      { source: '/apps', destination: '/templates', permanent: false },
    ];
  },
};

export default nextConfig;
