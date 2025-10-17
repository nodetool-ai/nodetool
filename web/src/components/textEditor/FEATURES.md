# Lexical Editor Features

This document describes all the cool features added to the Lexical editor for CommentNodes.

## ✨ Implemented Features

### 1. 🔗 Auto-Link Plugin

**File:** `AutoLinkPlugin.tsx`

Automatically converts URLs and email addresses into clickable links as you type.

**Features:**

- Detects HTTP/HTTPS URLs
- Detects email addresses
- Automatically wraps them in link nodes
- Works in real-time as you type

**Example:**

- Type: `https://github.com` → Becomes a clickable link automatically
- Type: `user@example.com` → Becomes a mailto link

---

### 2. 💬 Floating Text Format Toolbar

**File:** `FloatingTextFormatToolbar.tsx`

A beautiful, Medium/Notion-style floating toolbar that appears when you select text.

**Features:**

- Appears above selected text
- Dark theme with glassmorphism effect
- Format buttons: Bold, Italic, Underline, Strikethrough, Code
- Add/remove links
- Keyboard shortcuts work too (Cmd/Ctrl+B, Cmd/Ctrl+I, etc.)

**Usage:**

1. Select any text
2. Toolbar appears above your selection
3. Click formatting buttons
4. Click link icon to add/edit links

---

### 3. 🔗 Floating Link Editor

**File:** `FloatingLinkEditor.tsx`

An elegant popup for editing links when you click on them.

**Features:**

- Click any link to see the editor
- Edit URL inline
- Open link in new tab
- Remove link
- Beautiful dark UI matching the text toolbar

**Usage:**

1. Click any link in the editor
2. Popup appears below the link
3. Edit, open, or delete the link

---

### 4. ─ Horizontal Rules

**Files:** `HorizontalRuleNode.tsx`, `HorizontalRulePlugin.tsx`

Visual separators for organizing your comments.

**Features:**

- Custom horizontal rule node
- Clean, minimal design
- Hover effect for visual feedback
- Keyboard shortcut ready

**Usage:**

- Click the "─" button in the toolbar
- Or dispatch `INSERT_HORIZONTAL_RULE_COMMAND` programmatically

---

### 5. 📝 Export to Markdown

**File:** `exportMarkdown.ts`

Export your editor content as markdown with one click.

**Features:**

- `exportToMarkdown(editor)` - Get markdown string
- `copyAsMarkdown(editor)` - Copy to clipboard
- `downloadAsMarkdown(editor, filename)` - Download as .md file

**Usage:**

- Click the copy icon (📋) in the toolbar
- Content is copied as markdown to your clipboard
- Visual feedback shows when copied successfully

**Supported Markdown:**

- Headers (h1-h6)
- Bold, italic, strikethrough
- Links
- Lists (ordered and unordered)
- Code blocks and inline code
- Blockquotes
- Horizontal rules

---

## 🎨 Theme Styling

All elements have proper theme styling:

- **Links:** Blue (#60a5fa) with hover underline
- **Code:** Monospace with dark background
- **Headings:** Proper sizing (h1=2em, h2=1.5em, h3=1.25em)
- **Quotes:** Left border with italic text
- **Lists:** Proper indentation and spacing
- **Horizontal Rules:** Semi-transparent with hover effect

---

## 🎯 Already Existing Features

These were already configured in your editor:

- ✅ Rich text editing (bold, italic)
- ✅ Code blocks with syntax highlighting
- ✅ Headings (h1-h6)
- ✅ Lists (ordered and unordered)
- ✅ Blockquotes
- ✅ Markdown paste conversion
- ✅ History (undo/redo)
- ✅ Font size toggle

---

## 🚀 Usage Examples

### Basic Text Formatting

1. Select text
2. Floating toolbar appears
3. Click Bold/Italic/etc.

### Adding Links

**Method 1:** Type a URL directly

```
Type: Check out https://nodetool.ai
Result: URL becomes clickable automatically
```

**Method 2:** Select text and add link

1. Select text: "Click here"
2. Click link icon in floating toolbar
3. Enter URL in prompt
4. Text becomes a link

### Inserting Horizontal Rules

Click the "─" button in the hover toolbar to insert a visual separator.

### Exporting to Markdown

1. Click the copy icon (📋) in toolbar
2. Paste anywhere to get markdown format
3. Perfect for documentation!

---

## 🎮 Keyboard Shortcuts

- `Cmd/Ctrl + B` - Bold
- `Cmd/Ctrl + I` - Italic
- `Cmd/Ctrl + U` - Underline
- `Cmd/Ctrl + Z` - Undo
- `Cmd/Ctrl + Shift + Z` - Redo
- `Escape` - Close link editor if editing

---

## 🔮 Future Enhancement Ideas

These features could be added next:

- [ ] Checkboxes/Task lists (just need CheckListPlugin)
- [ ] Tables support
- [ ] Slash commands (/heading, /code, etc.)
- [ ] Emoji picker
- [ ] Image support
- [ ] Collapsible sections
- [ ] Find & replace
- [ ] @mentions
- [ ] Hashtag support
- [ ] Color picker for text
- [ ] Alignment options

---

## 📦 Dependencies

All features use official Lexical packages:

- `@lexical/react` - Core React integration
- `@lexical/link` - Link nodes and utilities
- `@lexical/markdown` - Markdown conversion
- `@lexical/code` - Code highlighting
- `@lexical/rich-text` - Headers, quotes
- `@lexical/list` - List support
- `@lexical/utils` - Helper utilities

---

## 🎨 Customization

To customize the appearance:

1. **Toolbar Colors:** Edit `FloatingTextFormatToolbar.tsx` styles
2. **Link Colors:** Edit `.editor-link` in `LexicalEditor.tsx`
3. **Theme Classes:** Edit theme object in `CommentNode.tsx`
4. **Horizontal Rule:** Edit styles in `HorizontalRuleNode.tsx`

Enjoy your supercharged comment editor! 🚀
