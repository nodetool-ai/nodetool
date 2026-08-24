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
    // page below is gone. A template a curated app now binds sends its old page
    // to that app; the rest send theirs to the workflow's own template page.
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

    // A merged slug resolves to its absorbing template first, so an old link
    // reaches its destination in one hop rather than a chain.
    const appDestination = (slug) => {
      const template = merges[slug] ?? slug;
      const app = absorbedByApp[template];
      return app ? `/apps/${app}` : `/templates/${template}`;
    };
    const retiredApps = [
      ...Object.keys(merges),
      ...Object.keys(absorbedByApp),
      ...workflowOnly,
    ];

    return [
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
        }))
        // Model Arena kept its slug as a curated app; it redirects to itself.
        .filter((r) => r.source !== r.destination),
    ];
  },
};

export default nextConfig;
