---
layout: page
title: "NodeTool Theme"
---

A custom Jekyll theme designed specifically for the NodeTool documentation with a cyberpunk-inspired, futuristic aesthetic.

## Features

### Visual Design

- **Dark Color Scheme**: Deep dark backgrounds (#0a0e17) with vibrant neon accents
- **Cyberpunk Aesthetics**: Animated grid background and scanline effects
- **Neon Accent Colors**:
  - Cyan (#00d9ff) - Primary accent
  - Magenta (#ff00ff) - Secondary accent
  - Purple (#bd00ff) - Tertiary accent
  - Electric Blue (#4d9eff) - Quaternary accent
  - Green (#00ff9f) - Code highlights

### Typography

- **Headings**: Orbitron font family for that futuristic tech feel
- **Body Text**: Inter for excellent readability
- **Code**: JetBrains Mono for crisp code display

### Interactive Elements

- **Smooth Animations**: All transitions use cubic-bezier easing for polished feel
- **Glow Effects**: Neon glow on hover states and interactive elements
- **Copy Buttons**: Auto-added to all code blocks with smooth feedback
- **Scroll Animations**: Fade-in animations for content sections
- **Logo Glitch**: Subtle cyberpunk glitch effect on the logo

### Layout Components

#### Header

- Sticky navigation that stays visible while scrolling
- Glassmorphism effect with backdrop blur
- Responsive mobile menu
- Social links to GitHub and Discord

#### Sidebar

- Fixed navigation for documentation pages
- Organized by sections: Getting Started, Core Features, Models & Providers, Reference, Advanced
- Active link highlighting
- Smooth scrolling with custom scrollbar styling

#### Footer

- Multi-column grid layout
- Quick links to all major documentation sections
- Animated neon glow effect on top border

#### Content Area

- Maximum width for optimal reading (900px)
- Syntax highlighting for code blocks
- Styled tables with hover effects
- Custom blockquote styling
- Enhanced image display with borders and shadows

### Responsive Design

- **Desktop**: Full sidebar + content layout
- **Tablet** (≤1024px): Narrower sidebar
- **Mobile** (≤768px): Collapsible sidebar, hamburger menu

## File Structure

```
docs/
├── _layouts/
│   ├── default.html    # Base layout with header, footer, and background effects
│   ├── page.html       # Documentation page layout with sidebar
│   └── home.html       # Homepage layout with hero section
├── _includes/
│   ├── header.html     # Site header with navigation
│   ├── footer.html     # Site footer with links
│   └── sidebar.html    # Documentation sidebar navigation
├── assets/
│   ├── css/
│   │   └── style.scss  # Main stylesheet with all theme styles
│   └── js/
│       └── theme.js    # Interactive JavaScript features
└── _config.yml         # Jekyll configuration
```

## Usage

### Running Locally

```bash
# Install dependencies
bundle install

# Build the site
bundle exec jekyll build

# Serve locally with auto-rebuild
bundle exec jekyll serve

# Visit http://localhost:4000/docs
```

### Adding New Pages

Create a new markdown file with front matter:

```markdown
---
layout: page
title: "Your Page Title"
---

# Your Page Title

Your content here...
```

### Layouts

- **home**: Use for the main index page (includes hero section)
- **page**: Use for documentation pages (includes sidebar)
- **default**: Base layout (rarely used directly)

### Customization

#### Colors

Edit CSS variables in `assets/css/style.scss`:

```css
:root {
  --color-accent-cyan: #00d9ff;
  --color-accent-magenta: #ff00ff;
  /* ... more variables */
}
```

#### Sidebar Navigation

Edit `_includes/sidebar.html` to modify the navigation structure.

#### Header Links

Edit `_includes/header.html` to change top navigation items.

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Performance Features

- Optimized animations using CSS transforms
- Lazy loading for scroll animations
- Minimal JavaScript footprint
- CSS variables for consistent theming
- Preconnect to Google Fonts for faster loading

## Accessibility

- Semantic HTML structure
- ARIA labels on interactive elements
- Keyboard navigation support
- High contrast text (WCAG AA compliant)
- Focus indicators on interactive elements

## Special Effects

### Cyber Grid

Animated grid pattern in the background that pulses gently.

### Scanline

Vertical scanline that travels down the page for that retro-futuristic CRT effect.

### Glow Effects

Neon glow on:

- Links on hover
- Active navigation items
- Code block borders
- Social media icons
- Logo text

### Animations

- Fade-in on scroll for content sections
- Bracket pulse on logo hover
- Button transitions
- Navigation underline effects

## Credits

- Fonts: Google Fonts (Orbitron, Inter, JetBrains Mono)
- Icons: Inline SVG from various open sources
- Design: Custom cyberpunk/futuristic theme for NodeTool

## License

This theme is part of the NodeTool project and follows the same AGPL-3.0 license.
