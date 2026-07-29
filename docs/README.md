---
layout: page
title: "NodeTool Documentation"
---


This directory contains the markdown files for the NodeTool documentation. The site is built using [Jekyll](https://jekyllrb.com/), a static site generator that converts markdown files into a complete website, and deployed to <https://docs.nodetool.ai> via the `Deploy Jekyll site to Pages` GitHub Action (`.github/workflows/jekyll.yml`).

The documentation uses a custom-built **dark theme** that mirrors the NodeTool app's palette (Inter type, a deep `#08090A` background, restrained blue/magenta accents). See [THEME.md](THEME.md) for complete theme documentation.

## Prerequisites

- **Ruby** 2.7 or higher (check with `ruby -v`)
- **Bundler** gem (install with `gem install bundler`)

## Initial Setup

1. Install dependencies:
   ```bash
   cd docs
   bundle install
   ```

   This will install Jekyll and all required plugins specified in the Gemfile.

## Local Development

To build and serve the site locally:

```bash
bundle exec jekyll serve
```

The site will be available at <http://localhost:4000>

For live reload (automatically rebuilds on file changes):
```bash
bundle exec jekyll serve --livereload
```

For incremental builds (faster rebuilds):
```bash
bundle exec jekyll serve --incremental
```

## Building for Production

To build the static site without serving:
```bash
bundle exec jekyll build
```

The built site will be in the `_site/` directory.

## Node Reference

The per-node reference pages under `nodes/` are generated from the node sources.
Regenerate them (and the namespace index) from the repo root:

```bash
npm run generate:node-docs    # regenerate node pages + rebuild nodes/index.md
npm run generate:node-index   # rebuild nodes/index.md only (fast, reads from disk)
```

The same generator writes `nodes/catalog.json`, the machine-readable catalog
used by agents to discover node types, inputs, outputs, and documentation URLs.
Jekyll also publishes each public page as a standalone `.md` representation
with front matter, for example `/cli.md` and `/nodes/index.md`.

`scripts/build-node-index.mjs` rebuilds `nodes/index.md` straight from the pages
on disk, so totals and namespaces always match what's actually published.

> **Known drift:** the on-disk directory layout (e.g. `lib/numpy`, `lib/pillow`,
> `vector/sqlite-vec`) predates a namespace rename and no longer matches the
> `namespace:` front matter (e.g. `lib.array`, `lib.image`, `vector.chroma`). The
> index labels each entry by its (authoritative) front-matter namespace and links
> to the real directory, so navigation works today. A full `generate:node-docs`
> run against the current node registry is the proper fix and will realign the
> directories.

## Bridge Protocol Documentation

The Python worker bridge is documented in:

- `python-bridge-protocol.md` — public website page
- `../nodetool-core/README.md` — repo-local overview for Python contributors


## Project Structure

```
docs/
├── _config.yml          # Jekyll configuration
├── Gemfile              # Ruby dependencies
├── _layouts/            # Custom theme layouts
│   ├── default.html     # Base layout with cyber effects
│   ├── page.html        # Documentation page layout
│   ├── home.html        # Homepage layout with hero
│   └── redirect.html    # Redirect layout for moved pages
├── _includes/           # Reusable components
│   ├── header.html      # Site header and navigation
│   ├── footer.html      # Site footer
│   └── sidebar.html     # Documentation sidebar
├── assets/              # Theme assets and media
│   ├── css/
│   │   └── main.scss    # Main theme stylesheet
│   ├── js/
│   │   └── theme.js     # Interactive features
│   └── *.png, *.mp4     # Images and videos
├── index.md             # Homepage
├── *.md                 # Documentation pages
├── 404.html             # Custom error page
├── THEME.md             # Theme documentation
└── _site/               # Generated site (git-ignored)
```

## Theme Features

The custom dark theme includes:

- **Palette**: Deep `#08090A` background with restrained blue/magenta accents, matching the NodeTool app's `paletteDark.ts`
- **Subtle effects**: A gently animated grid background (`.cyber-grid`)
- **Typography**: Inter for headings and body, JetBrains Mono for code
- **Interactive Elements**:
  - Client-side search over `/search.json` (press `/`)
  - Auto-generated copy buttons on code blocks, plus "Copy page as Markdown"
  - Collapsible sidebar with scroll persistence
  - Reading-progress bar and back-to-top button
  - Lazy-loaded content images
  - Active link highlighting and responsive mobile menu
- **Layouts**:
  - `home`: Homepage with hero section
  - `page`: Documentation pages with sidebar navigation
  - `default`: Base layout (rarely used directly)

See [THEME.md](THEME.md) for detailed theme documentation and customization options.

## Adding New Pages

1. Create a new markdown file (e.g., `new-feature.md`)
2. Add front matter at the top:
   ```yaml
   ---
   layout: page
   title: "New Feature"
   ---
   ```
3. Add the page to sidebar navigation in `_includes/sidebar.html`
4. Optionally add to header in `_config.yml` under `header_pages`
5. Write your content using markdown

## Configuration

Main configuration is in `_config.yml`:
- **Site settings**: title, description, URLs
- **Base URL**: `baseurl` is set to `""` (served from site root)
- **Navigation**: page order in header
- **Plugins**: enabled Jekyll plugins
- **Custom theme**: Uses custom layouts in `_layouts/` and `_includes/`

### Customizing the Theme

To customize colors, edit CSS variables in `assets/css/main.scss`:

```css
:root {
  --color-bg-primary: #08090A;
  --color-text-primary: #F7F8F8;
  --color-accent-blue: #6690d4;
  --color-accent-magenta: #E879F9;
  /* ... more variables */
}
```

To modify navigation:
- **Header**: Edit `_includes/header.html`
- **Sidebar**: Edit `_includes/sidebar.html`
- **Footer**: Edit `_includes/footer.html`

## Plugins

This site uses several helpful Jekyll plugins:
- `jekyll-seo-tag`: SEO optimization
- `jekyll-sitemap`: Automatic sitemap generation
- `jekyll-feed`: RSS feed
- `jekyll-relative-links`: Convert `.md` links to `.html`
- `jekyll-optional-front-matter`: Allow pages without front matter
- `jekyll-titles-from-headings`: Extract titles from first heading

## Troubleshooting

**Bundle install fails:**
```bash
gem install bundler
bundle update
```

**Port already in use:**
```bash
bundle exec jekyll serve --port 4001
```

**Clear cache:**
```bash
bundle exec jekyll clean
```

## GitHub Pages Deployment

The site deploys automatically via the **`Deploy Jekyll site to Pages`** GitHub Action (`.github/workflows/jekyll.yml`) on every push to `main` (and via manual `workflow_dispatch`). The workflow runs `bundle exec jekyll build` with `JEKYLL_ENV=production` and publishes `docs/_site` to GitHub Pages — it does **not** use the restricted branch-based Pages builder, so custom plugins under `_plugins/` are supported.

The published site is served at <https://docs.nodetool.ai> (see `CNAME`).

> Pages **Settings → Build and deployment → Source** must be set to **GitHub Actions** (not "Deploy from a branch").

## Theme Development

When working on the theme:

1. **CSS Changes**: Edit `assets/css/main.scss`
   - Uses SCSS with Jekyll front matter
   - Organized with CSS variables for easy customization
   - Includes responsive breakpoints

2. **JavaScript**: Edit `assets/js/theme.js`
   - Handles mobile menu, copy buttons, scroll animations
   - Vanilla JavaScript, no dependencies

3. **Layouts**: Edit files in `_layouts/` and `_includes/`
   - Use Liquid templating syntax
   - Include relative_url filter for proper path handling

4. **Testing**: Always test locally before deploying
   ```bash
   bundle exec jekyll serve --livereload
   ```

For complete theme documentation, see [THEME.md](THEME.md).
