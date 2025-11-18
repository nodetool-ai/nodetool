# NodeTool Documentation

This directory contains the markdown files for the NodeTool documentation. The site is built using [Jekyll](https://jekyllrb.com/), a static site generator that converts markdown files into a complete website.

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
├── index.md             # Homepage
├── assets/              # Images and static files
│   └── images/
├── *.md                 # Documentation pages
└── _site/               # Generated site (git-ignored)
```

## Adding New Pages

1. Create a new markdown file (e.g., `new-feature.md`)
2. Optionally add front matter at the top:
   ```yaml
   ---
   title: New Feature
   layout: default
   ---
   ```
3. Add the page to navigation in `_config.yml` under `header_pages` if desired
4. Write your content using markdown

## Configuration

Main configuration is in `_config.yml`:
- **Site settings**: title, description, URLs
- **Navigation**: page order in header
- **Plugins**: enabled Jekyll plugins
- **Theme settings**: Minima theme customization

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
