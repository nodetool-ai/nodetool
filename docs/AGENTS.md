# Documentation Guide

**Navigation**: [Root AGENTS.md](../AGENTS.md) → **Documentation**

This guide helps AI agents understand the documentation structure and writing guidelines for NodeTool.

## Overview

The `/docs` directory contains user-facing documentation built with Jekyll static site generator. Documentation covers all aspects of using NodeTool from getting started to advanced development topics.

## Documentation Structure

### Documentation Organization

```
/docs
├── index.md                    # Homepage
├── getting-started.md          # Quick start guide
├── installation.md             # Installation instructions
├── user-interface.md           # UI overview
├── workflow-editor.md          # Editor usage guide
├── workflows/                  # Workflow examples
│   ├── index.md
│   ├── movie-posters.md
│   ├── story-to-video-generator.md
│   └── ... (20+ workflow examples)
├── developer/                  # Developer guides
│   ├── index.md
│   ├── node-examples.md
│   ├── node-patterns.md
│   ├── node-reference.md
│   ├── suspendable-nodes.md
│   ├── dsl-guide.md
│   └── gradio-conversion.md
├── api.md                      # Main API docs
├── api-reference.md            # API endpoints
├── workflow-api.md             # Workflow API
├── chat-api.md                 # Chat API
├── chat-server.md              # Chat server
├── chat.md                     # Chat feature
├── global-chat.md              # Global chat
├── authentication.md           # Auth setup
├── providers.md                # AI providers
├── models.md                   # Model management
├── models-manager.md           # Model manager UI
├── configuration.md            # Configuration options
├── deployment.md               # Deployment guide
├── self_hosted.md              # Self-hosted deployment
├── troubleshooting.md          # Common issues
├── glossary.md                 # Terminology
├── _layouts/                   # Jekyll templates
│   ├── default.html
│   └── home.html
└── _includes/                  # Reusable includes
```

### Key Documentation Files

#### User Guides

- **`getting-started.md`** - Quick start guide for new users
- **`installation.md`** - Detailed installation instructions
- **`user-interface.md`** - Overview of the NodeTool UI
- **`workflow-editor.md`** - How to use the visual editor
- **`global-chat.md`** - AI chat feature documentation
- **`models.md`** - Managing AI models
- **`models-manager.md`** - Model manager UI guide
- **`providers.md`** - Setting up AI providers

#### Workflow Examples

- **`workflows/index.md`** - Workflow examples overview
- **`workflows/movie-posters.md`** - Movie poster generation
- **`workflows/story-to-video-generator.md`** - Story to video
- **`workflows/image-enhancement.md`** - Image enhancement
- **`workflows/transcribe-audio.md`** - Audio transcription
- **`workflows/summarize-papers.md`** - Paper summarization
- And many more...

#### Developer Guides

- **`developer/index.md`** - Developer documentation home
- **`developer/node-examples.md`** - Node implementation examples
- **`developer/node-reference.md`** - Node API reference
- **`developer/node-patterns.md`** - Common node patterns
- **`developer/suspendable-nodes.md`** - Suspendable node implementation
- **`developer/dsl-guide.md`** - DSL usage guide
- **`developer/gradio-conversion.md`** - Converting Gradio workflows

#### API Documentation

- **`api.md`** - Main API documentation
- **`api-reference.md`** - Detailed API reference
- **`workflow-api.md`** - Workflow API endpoints
- **`chat-api.md`** - Chat API endpoints
- **`chat-server.md`** - Chat server documentation
- **`terminal-websocket.md`** - Terminal WebSocket API

#### Reference & Configuration

- **`glossary.md`** - Terminology definitions
- **`troubleshooting.md`** - Common issues and solutions
- **`configuration.md`** - Configuration options
- **`authentication.md`** - Authentication setup
- **`key-concepts.md`** - Core NodeTool concepts
- **`architecture.md`** - System architecture

## Jekyll Site Configuration

### Build Configuration

The site is built with Jekyll using `_config.yml`:

```yaml
# Site configuration
site:
  title: NodeTool
  description: AI Workflow Automation Platform

# Markdown settings
markdown: kramdown
highlighter: rouge

# Plugins
plugins:
  - jekyll-seo-tag
  - jekyll-sitemap

# Excludes
exclude:
  - Gemfile
  - Gemfile.lock
```

### Layout Templates

Located in `_layouts/`:

- **`default.html`** - Standard page layout with sidebar
- **`home.html`** - Homepage layout with feature grid
- **`page.html`** - Content page layout

### Includes

Located in `_includes/`:

- **`header.html`** - Site header with navigation
- **`footer.html`** - Site footer with links
- **`sidebar.html`** - Documentation sidebar navigation

## Writing Documentation

### Markdown Style Guide

Use consistent markdown formatting:

```markdown
# Level 1 Heading - Page title
## Level 2 Heading - Major sections
### Level 3 Heading - Subsections
#### Level 4 Heading - Details

**Bold** for emphasis
*Italic* for terms
`code` for inline code

## Code Blocks

Use fenced code blocks with language specification:

```python
def example_function():
    return "Hello"
```

```typescript
const example = "Hello";
```

```bash
npm install nodetool
```

### Document Structure

Use this template for new documentation pages:

```markdown
---
title: "Page Title"
description: "Brief description for SEO"
layout: default
---

# Page Title

Brief paragraph introducing the topic.

## Section 1

Content...

## Section 2

Content...

## Related Topics

- [Related Page](related-page.md)
- [Another Page](another-page.md)

## See Also

- [External Resource](https://example.com)
```

### Front Matter

All markdown files should include front matter:

```yaml
---
title: "Page Title"
description: "One or two sentence description"
layout: default
---
```

## Documentation Best Practices

### 1. User-Focused Content

- Write for the user's perspective
- Use clear, simple language
- Provide step-by-step instructions
- Include screenshots and diagrams

### 2. Consistency

- Use consistent terminology
- Follow markdown style guide
- Maintain similar structure across pages
- Use the same code block language specifiers

### 3. Accessibility

- Use proper heading hierarchy
- Provide alt text for images
- Use descriptive link text
- Ensure code examples are readable

### 4. Code Examples

- Provide working, copy-paste ready code
- Include imports and setup
- Show expected output
- Add comments for complex code

### 5. Testing Documentation

- Verify all code examples work
- Test all commands and instructions
- Check all links are valid
- Ensure images load correctly

## Common Documentation Patterns

### Tutorial Format

```markdown
## Tutorial: Creating a Workflow

In this tutorial, you'll learn how to create a workflow that [does X].

### Prerequisites

Before starting, make sure you have:
- NodeTool installed
- [Other requirement]
- [Another requirement]

### Step 1: [Action]

[Instructions...]

### Step 2: [Action]

[Instructions...]

### Complete!

You've successfully [achieved goal]. Next, try [suggested next step].
```

### API Documentation Format

```markdown
## API Endpoint: /api/resource

### Description

Brief description of what this endpoint does.

### Request

**Method**: POST
**URL**: `/api/resource`

**Headers**:
```
Content-Type: application/json
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "parameter": "value"
}
```

### Response

**Success (200)**:
```json
{
  "success": true,
  "data": {}
}
```

**Error (400)**:
```json
{
  "success": false,
  "error": "Error message"
}
```

### Example

```typescript
const response = await fetch('/api/resource', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ parameter: 'value' })
});
```

### Troubleshooting Format

```markdown
## Common Issues

### Issue: [Problem description]

**Symptoms**:
- Symptom 1
- Symptom 2

**Cause**: Explanation of what causes the issue

**Solution**:
1. Step 1
2. Step 2

**Alternative Solution**: If the first doesn't work, try this.

### Issue: Another problem

[Same pattern...]

## Adding New Documentation

### For New Features

1. Create markdown file in appropriate directory
2. Add front matter
3. Write content following style guide
4. Add link to navigation (sidebar)
5. Test by building site locally
6. Update related pages if needed

### For Workflow Examples

1. Create workflow file in `workflows/` directory
2. Add to `workflows/index.md`
3. Include:
   - Workflow description
   - Prerequisites
   - Setup instructions
   - Usage examples
   - Output examples
4. Add screenshots/videos if helpful

### For API Changes

1. Update relevant API documentation
2. Add new endpoints or update existing ones
3. Update example code
4. Document breaking changes
5. Update changelog

## Building Documentation Locally

### Prerequisites

- Ruby and Bundler
- Jekyll

### Setup

```bash
cd docs
bundle install
```

### Build

```bash
bundle exec jekyll serve
```

Site will be available at `http://localhost:4000`

### Production Build

```bash
bundle exec jekyll build
```

Output is in `_site/` directory

## Related Documentation

- [Root AGENTS.md](../AGENTS.md) - Project overview
- [Web AGENTS.md](../web/src/AGENTS.md) - Web application
- [Developer Guide](developer/index.md) - Developer documentation

## Quick Reference

### Markdown Elements

| Element | Syntax | Example |
|---------|---------|----------|
| Heading | `# Title` | Title |
| Bold | `**text**` | **text** |
| Italic | `*text*` | *text* |
| Code | `` `code` `` | `code` |
| Code block | Three backticks with language | Code |
| Link | `[text](url)` | [link](https://) |
| Image | `
![alt](url)
` | ![logo](logo.png) |
| List | `- item` | • item |
| Table | `\| col \|` | See examples |

### Common Front Matter

```yaml
---
title: "Page Title"
description: "SEO description"
layout: default
---

Content...
```

---

**Note**: This guide is for AI coding assistants. For user documentation, see [docs.nodetool.ai](https://docs.nodetool.ai).
