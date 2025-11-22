# NodeTool Documentation

This directory contains the markdown files for the NodeTool documentation. The site is built using [Jekyll](https://jekyllrb.com/), a static site generator that converts markdown files into a complete website.

The documentation features a custom-built **futuristic dark theme** with cyberpunk aesthetics, neon accents, and smooth animations. See [THEME.md](THEME.md) for complete theme documentation.

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

The site will be available at <http://localhost:4000/docs>

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

## Project Structure

```
docs/
├── _config.yml          # Jekyll configuration
├── Gemfile              # Ruby dependencies
├── _layouts/            # Custom theme layouts
│   ├── default.html     # Base layout with cyber effects
│   ├── page.html        # Documentation page layout
│   └── home.html        # Homepage layout with hero
├── _includes/           # Reusable components
│   ├── header.html      # Site header and navigation
│   ├── footer.html      # Site footer
│   └── sidebar.html     # Documentation sidebar
├── assets/              # Theme assets and media
│   ├── css/
│   │   └── style.scss   # Main theme stylesheet
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

- **Cyberpunk Aesthetics**: Dark backgrounds with vibrant neon accents (cyan, magenta, purple)
- **Animated Effects**: Pulsing grid background, scanline effect, neon glows
- **Typography**: Orbitron for headings, Inter for body, JetBrains Mono for code
- **Interactive Elements**:
  - Auto-generated copy buttons on code blocks
  - Smooth scroll animations
  - Active link highlighting
  - Responsive mobile menu
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
- **Navigation**: page order in header
- **Plugins**: enabled Jekyll plugins
- **Custom theme**: Uses custom layouts in `_layouts/` and `_includes/`

### Customizing the Theme

To customize colors, edit CSS variables in `assets/css/style.scss`:

```css
:root {
  --color-accent-cyan: #00d9ff;
  --color-accent-magenta: #ff00ff;
  --color-accent-purple: #bd00ff;
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

This site can be automatically deployed to GitHub Pages. GitHub will build the site using Jekyll when changes are pushed to the repository.

To configure GitHub Pages:
1. Go to repository Settings > Pages
2. Select the branch containing the docs (usually `main`)
3. Set the folder to `/docs`
4. Save

The site will be available at `https://<username>.github.io/<repository>/docs`

## Theme Development

When working on the theme:

1. **CSS Changes**: Edit `assets/css/style.scss`
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
