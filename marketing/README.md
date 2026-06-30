This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Deployment

The site runs on Cloudflare Workers via [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare). Production deploys are driven by GitHub Actions (`.github/workflows/marketing-ci.yml`), not by Cloudflare's git integration: the `deploy` job runs on push to `main` and only ships after typecheck, lint, build, and the Playwright smoke tests pass.

To enable it, set two secrets on the repo (or on the `marketing-production` environment):

- `CLOUDFLARE_API_TOKEN` — token with "Edit Cloudflare Workers" + Workers R2 Storage permissions
- `CLOUDFLARE_ACCOUNT_ID` — the account that owns the Worker

Then disconnect the repo from Cloudflare Workers Builds / Pages git integration so the site is only deployed from the workflow.

Deploy from your machine when you need to (uses your local `wrangler` auth):

```bash
npm run deploy    # opennextjs-cloudflare build && opennextjs-cloudflare deploy
npm run preview   # build and preview the Worker locally
```
