# Documentation Guide

**Navigation**: [Root AGENTS.md](../AGENTS.md) → **Docs**

This guide helps AI agents understand the documentation structure and conventions for NodeTool.

## Overview

The `docs` directory contains user-facing documentation served at [docs.nodetool.ai](https://docs.nodetool.ai). It uses Jekyll for static site generation with a custom theme.

## Documentation Structure

```
/docs
├── /_includes          # Reusable HTML snippets
├── /_layouts           # Page templates
├── /assets             # CSS, JavaScript, images
├── /cookbook           # Tutorial examples
├── /developer          # Developer guides
├── /nodes              # Node-specific documentation
├── /workflows          # Workflow examples
└── *.md                # Documentation pages
```

## Key Documentation Files

### Getting Started
- `index.md` - Homepage
- `getting-started.md` - Quick start guide
- `installation.md` - Installation instructions
- `key-concepts.md` - Core concepts

### User Guides
- `workflow-editor.md` - Workflow editor usage
- `user-interface.md` - UI overview
- `asset-management.md` - Managing assets
- `models-manager.md` - Model management

### Node Documentation
- `/nodes/comfy/` - ComfyUI nodes
- `/nodes/huggingface/` - HuggingFace nodes
- `/nodes/openai/` - OpenAI nodes
- `/nodes/nodetool/` - NodeTool core nodes

### Developer Documentation
- `/developer/` - Developer-focused guides
- `api-reference.md` - API documentation
- `deployment.md` - Deployment guides

### Cookbooks & Examples
- `/cookbook/` - Step-by-step tutorials
- `/workflows/` - Example workflows

## Writing Documentation

### Markdown Format

Use GitHub Flavored Markdown:

```markdown
# Page Title

Brief introduction paragraph.

## Section Heading

Content goes here.

### Subsection

More detailed content.

#### Code Examples

```python
# Python example
def my_function():
    return "Hello"
```

```typescript
// TypeScript example
const myFunction = (): string => {
  return "Hello";
};
```

### Tables

| Column 1 | Column 2 |
|----------|----------|
| Data 1   | Data 2   |

### Lists

- Unordered item 1
- Unordered item 2

1. Ordered item 1
2. Ordered item 2

### Links

[Link text](https://example.com)
[Internal link](./other-page.md)

### Images

![Alt text](/assets/images/screenshot.png)

### Admonitions

> **Note**: This is a note.

> **Warning**: This is a warning.

> **Tip**: This is a helpful tip.
```

### Frontmatter

Every page should have frontmatter:

```markdown
---
layout: default
title: Page Title
description: Brief description for SEO
nav_order: 2
parent: Parent Page Name
---
```

## Documentation Best Practices

### 1. Structure
- Start with overview/introduction
- Use clear hierarchical headings
- Break content into digestible sections
- Include practical examples

### 2. Writing Style
- Use present tense
- Be concise and clear
- Avoid jargon when possible
- Define technical terms
- Use active voice

### 3. Code Examples
- Include complete, runnable examples
- Add comments to explain non-obvious code
- Show both input and expected output
- Test all code examples

### 4. Images & Screenshots
- Use descriptive alt text
- Keep images up-to-date with UI
- Annotate screenshots when helpful
- Optimize image sizes

### 5. Cross-References
- Link to related documentation
- Use relative links for internal pages
- Keep links up-to-date
- Provide context for external links

## Node Documentation Template

When documenting nodes:

```markdown
---
layout: default
title: Node Name
parent: Node Category
---

# Node Name

Brief description of what the node does.

## Inputs

| Input | Type | Description | Required |
|-------|------|-------------|----------|
| input_name | string | Input description | Yes |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output_name | image | Output description |

## Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| prop_name | int | 10 | Property description |

## Usage Example

```python
# Example usage
node = NodeName(
    input_name="value",
    prop_name=20
)
```

## Common Use Cases

1. Use case 1
2. Use case 2

## Tips

- Tip 1
- Tip 2

## Related Nodes

- [OtherNode](./other-node.md)
- [SimilarNode](./similar-node.md)
```

## Workflow Documentation Template

```markdown
---
layout: default
title: Workflow Name
parent: Workflows
---

# Workflow Name

Brief description of the workflow.

## Overview

What this workflow does and why it's useful.

## Prerequisites

- Prerequisite 1
- Prerequisite 2

## Steps

### 1. Step One

Description and instructions.

![Step 1](/assets/workflows/step1.png)

### 2. Step Two

Description and instructions.

### 3. Step Three

Description and instructions.

## Result

Expected output description.

![Final result](/assets/workflows/result.png)

## Variations

- Variation 1
- Variation 2

## Troubleshooting

- Problem 1: Solution
- Problem 2: Solution
```

## Building and Testing Docs Locally

### Prerequisites
```bash
gem install jekyll bundler
```

### Build and Serve
```bash
cd docs
bundle install
bundle exec jekyll serve
# Visit http://localhost:4000
```

### Check for Broken Links
```bash
bundle exec jekyll build
# Use link checker tool
```

## SEO Best Practices

1. **Title Tags**: 50-60 characters
2. **Meta Descriptions**: 150-160 characters
3. **Headings**: Use H1-H6 hierarchically
4. **Alt Text**: Describe images for accessibility
5. **Internal Links**: Connect related content
6. **URLs**: Use descriptive, lowercase, hyphenated slugs

## Accessibility

1. **Alt Text**: Provide for all images
2. **Heading Hierarchy**: Don't skip levels
3. **Link Text**: Make it descriptive ("Learn more" vs "Click here")
4. **Color Contrast**: Ensure readable text
5. **Code Blocks**: Specify language for syntax highlighting

## Related Documentation

- [Root AGENTS.md](../AGENTS.md) - Project overview
- [Web UI Guide](../web/src/AGENTS.md) - Web application

## Quick Reference

### Common Tasks
- Add new page: Create `.md` file with frontmatter
- Add to navigation: Set `nav_order` and `parent` in frontmatter
- Add images: Place in `/assets/images/` and reference
- Add code examples: Use fenced code blocks with language
- Update navigation: Modify `_config.yml` or page frontmatter

### File Locations
- User guides: Root `/docs` directory
- API docs: `/docs/api-reference.md`
- Node docs: `/docs/nodes/<category>/`
- Tutorials: `/docs/cookbook/`
- Dev guides: `/docs/developer/`

---

**Note**: This guide is for AI coding assistants. For user-facing documentation, see [docs.nodetool.ai](https://docs.nodetool.ai).
