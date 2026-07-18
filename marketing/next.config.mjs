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
    return Object.entries(merges).flatMap(([from, to]) => [
      { source: `/apps/${from}`, destination: `/apps/${to}`, permanent: true },
      { source: `/templates/${from}`, destination: `/templates/${to}`, permanent: true },
    ]);
  },
};

export default nextConfig;
