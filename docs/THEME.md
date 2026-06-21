---
layout: page
title: "NodeTool Docs Theme"
---

A custom Jekyll theme built for the NodeTool documentation: a calm, dark,
high-contrast reading environment that matches the NodeTool app's palette.

> This page documents the docs theme for contributors. It is **not** published
> to docs.nodetool.ai (see the `exclude:` list in `_config.yml`).

## Visual design

### Color scheme

The palette mirrors the NodeTool web app's `paletteDark.ts`. All colors are CSS
variables in `assets/css/main.scss`:

| Token | Value | Use |
|-------|-------|-----|
| `--color-bg-primary` | `#08090A` | Page background |
| `--color-bg-secondary` | `#101113` | Cards, panels |
| `--color-bg-tertiary` | `#1B1D21` | Insets, code blocks |
| `--color-text-primary` | `#F7F8F8` | Body text |
| `--color-text-secondary` | `#D4D6DB` | Secondary text |
| `--color-text-muted` | `#8A8F98` | Captions, hints |
| `--color-text-link` | `#93C5FD` | Links |
| `--color-accent-blue` | `#6690d4` | Primary accent |
| `--color-accent-cyan` | `#22D3EE` | Accent |
| `--color-accent-magenta` | `#E879F9` | Accent / gradient end |
| `--color-accent-green` | `#50FA7B` | Success / code accents |

A subtle animated grid (`.cyber-grid`) sits behind the content; accents are used
sparingly for links, active nav, and gradients (`#6690d4 → #E879F9`).

### Typography

- **Headings & body**: Inter (`--font-heading` / `--font-body`)
- **Code**: JetBrains Mono (`--font-mono`)

Fonts load from Google Fonts with `preconnect` for both Inter and JetBrains Mono.

### Interactive features (`assets/js/theme.js`, vanilla JS, no dependencies)

- Client-side search over `/search.json` (press <kbd>/</kbd>)
- Copy buttons on code blocks
- "Copy page as Markdown" button
- Collapsible sidebar sections with scroll/position persistence
- Reading-progress bar and back-to-top button
- Active-link highlighting and smooth in-page anchor scrolling
- Lazy-loading of in-content images
- Responsive mobile menu

## Layout components

| Component | File | Notes |
|-----------|------|-------|
| Base layout | `_layouts/default.html` | Header, footer, grid background, fonts, SEO, analytics; loads Mermaid only on pages with a diagram |
| Page layout | `_layouts/page.html` | Title, content, "Edit on GitHub" |
| Home layout | `_layouts/home.html` | Hero + landing content |
| Redirect layout | `_layouts/redirect.html` | Meta-refresh for moved pages |
| Header | `_includes/header.html` | Sticky nav, search, social links |
| Sidebar | `_includes/sidebar.html` | Sectioned documentation navigation |
| Footer | `_includes/footer.html` | Link columns |

Diagrams use a local Liquid tag — `{% raw %}{% mermaid %}…{% endmermaid %}{% endraw %}`
— defined in `_plugins/mermaid.rb`. Mermaid itself is loaded once, only on pages
that contain a diagram.

## File structure

```
docs/
├── _config.yml          # Jekyll configuration, plugins, excludes, SEO defaults
├── _plugins/
│   └── mermaid.rb       # Local {% raw %}{% mermaid %}{% endraw %} tag (emits the diagram div only)
├── _layouts/            # default, page, home, redirect
├── _includes/           # header, footer, sidebar
├── assets/
│   ├── css/main.scss    # Theme stylesheet (compiled to main.css)
│   ├── js/theme.js      # Interactive features
│   ├── icons/           # Provider SVG icons
│   └── screenshots/     # Product screenshots
├── search.json          # Liquid-generated search index
├── llms.txt             # Curated LLM index
└── llms-full.txt        # Full guide text for LLM ingestion
```

## Running locally

```bash
cd docs
bundle install
bundle exec jekyll serve --livereload   # http://localhost:4000
```

## Customization

- **Colors / spacing / type**: edit the CSS variables at the top of
  `assets/css/main.scss`.
- **Sidebar navigation**: edit `_includes/sidebar.html`.
- **Top-nav links**: edit `_includes/header.html`.
- **SEO / social defaults**: edit `_config.yml` (`logo`, `twitter`, `social`,
  and the default `image` under `defaults`).

## Accessibility

- Semantic HTML, skip-to-content link, ARIA labels on interactive controls
- Keyboard navigation and visible focus states
- High-contrast text intended to meet WCAG AA

## License

Part of the NodeTool project, under AGPL-3.0.
