---
layout: page
title: "Code Node"
description: "Write and run JavaScript in a sandboxed environment with built-in libraries, snippets, and AI assistance."
---

The **Code Node** (`nodetool.code.Code`) lets you write and execute JavaScript directly inside your workflow. It runs in a secure sandbox with built-in libraries, dynamic inputs/outputs, streaming support, and an integrated code editor with AI assistance.

## Table of Contents

1. [Quick Start](#quick-start)
2. [How It Works](#how-it-works)
3. [Dynamic Inputs and Outputs](#dynamic-inputs-and-outputs)
4. [Built-in Libraries](#built-in-libraries)
5. [Available APIs](#available-apis)
6. [Streaming with Yield](#streaming-with-yield)
7. [Persistent State](#persistent-state)
8. [Properties](#properties)
9. [The Code Editor](#the-code-editor)
10. [Snippet Library](#snippet-library)
11. [AI Assistant](#ai-assistant)
12. [Sandbox Limits](#sandbox-limits)
13. [Examples](#examples)

---

## Quick Start

Drop a Code node onto your canvas, open the editor, and write JavaScript:

```javascript
const greeting = `Hello, ${name}!`;
return { greeting };
```

Add a dynamic input called `name` (type: string), connect it, and run the workflow. The node outputs `{ greeting: "Hello, World!" }` — each key in the returned object becomes an output handle you can wire to other nodes.

---

## How It Works

1. **Dynamic inputs** are injected as global variables in the sandbox
2. Your code runs in an isolated `vm` context with no access to the host system
3. The **return value** defines the node's outputs — return an object and each key becomes a named output handle
4. If you don't write an explicit `return`, the last expression is returned automatically (implicit return)

```javascript
// Explicit return
return { sum: a + b, product: a * b };

// Implicit return — the last expression is returned automatically
{ sum: a + b, product: a * b }
```

---

## Dynamic Inputs and Outputs

The Code node supports **dynamic inputs**: you can add as many inputs as you need from the node's property panel. Each input becomes a global variable in your code.

| Input Name | Variable in Code | Example Value |
|------------|-----------------|---------------|
| `text`     | `text`          | `"hello world"` |
| `count`    | `count`         | `42` |
| `items`    | `items`         | `[1, 2, 3]` |
| `data`     | `data`          | `{ key: "value" }` |

**Output handles** are created automatically from the keys of your returned object:

```javascript
// This creates three output handles: "upper", "lower", "length"
return {
  upper: text.toUpperCase(),
  lower: text.toLowerCase(),
  length: text.length
};
```

If you return a non-object value (string, number, array), it is wrapped as `{ output: value }`.

---

## Built-in Libraries

The sandbox includes several popular libraries, ready to use without imports:

| Variable    | Library   | Description |
|-------------|-----------|-------------|
| `_`         | [Lodash](https://lodash.com/docs)    | Functional utilities (map, filter, groupBy, etc.) |
| `dayjs`     | [Day.js](https://day.js.org/)     | Lightweight date/time manipulation |
| `cheerio`   | [Cheerio](https://cheerio.js.org/)    | jQuery-like HTML/XML parsing |
| `csvParse`  | [csv-parse](https://csv.js.org/parse/) | Synchronous CSV parsing |
| `validator` | [Validator.js](https://github.com/validatorjs/validator.js) | String validation (email, URL, IP, etc.) |

### Examples

```javascript
// Lodash — group items by category
const grouped = _.groupBy(items, "category");
return { grouped };

// Day.js — format a date
const formatted = dayjs(date).format("YYYY-MM-DD HH:mm");
return { formatted };

// Cheerio — extract links from HTML
const $ = cheerio.load(html);
const links = $("a").map((i, el) => $(el).attr("href")).get();
return { links };

// CSV parsing
const rows = csvParse(csvText, { columns: true });
return { rows };

// Validator — check input
return {
  isEmail: validator.isEmail(input),
  isURL: validator.isURL(input)
};
```

---

## Available APIs

| API | Description |
|-----|-------------|
| `fetch(url, options?)` | HTTP requests (15s timeout per request, max 20 requests) |
| `workspace.read(path)` | Read a file from the workflow workspace |
| `workspace.write(path, content)` | Write a file to the workflow workspace |
| `workspace.list(path?)` | List files in the workflow workspace |
| `getSecret(name)` | Retrieve a secret/API key by name |
| `uuid()` | Generate a random UUID v4 |
| `sleep(ms)` | Pause execution (max 5 seconds) |
| `console.log(...)` | Log messages (captured, not printed to stdout) |
| `state` | Persistent object that survives across streaming invocations |

### Fetch Example

```javascript
const response = await fetch("https://api.example.com/data", {
  headers: { Authorization: `Bearer ${getSecret("API_KEY")}` }
});
const data = await response.json();
return { data };
```

### Workspace Example

```javascript
// Write results to a file
await workspace.write("output/results.json", JSON.stringify(results, null, 2));

// Read a file back
const content = await workspace.read("output/results.json");
return { content: JSON.parse(content) };
```

---

## Streaming with Yield

Use `yield` to emit multiple outputs over time. This is useful for processing lists item-by-item or generating a sequence of results.

```javascript
// Emit each item in a list as a separate output
for (const item of items) {
  yield { processed: item.toUpperCase() };
}
```

Set **Sync Mode** to `on_any` to process streaming inputs as they arrive rather than waiting for all inputs.

```javascript
// Process each incoming message immediately
const enriched = { ...message, timestamp: dayjs().toISOString() };
yield { enriched };
```

---

## Persistent State

The `state` object persists across streaming invocations within a single workflow run. It resets when the workflow starts a new run.

```javascript
// Count how many times this node has been invoked
state.count = (state.count || 0) + 1;
return { count: state.count };
```

---

## Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| **Code** | `str` | `return {};` | JavaScript code to execute |
| **Timeout** | `int` | `30` | Max seconds before execution is aborted (0 = no limit) |
| **Sync Mode** | `enum` | `zip_all` | `zip_all` waits for all inputs; `on_any` fires when any input arrives |

---

## The Code Editor

Click the code property to open the full-featured editor. It provides a professional coding experience built on the Monaco editor (the same engine that powers VS Code).

### Editor Features

- **Syntax highlighting** — JavaScript with full color-coded tokens
- **Find & Replace** — search within your code (`Ctrl+F` / `Cmd+F`)
- **Word wrap toggle** — wrap long lines or scroll horizontally
- **Fullscreen mode** — expand the editor to fill the screen for complex code
- **Download** — save your code as a file
- **Status bar** — shows cursor position and editor state

### Toolbar

The editor toolbar provides quick access to:

| Button | Action |
|--------|--------|
| Code/Text toggle | Switch between code and rich text modes |
| Fullscreen | Expand editor to full screen |
| Download | Download the code as a file |
| Find & Replace | Open the search bar |
| Word Wrap | Toggle line wrapping |
| Chat | Open the AI assistant panel |

---

## Snippet Library

The Code node includes a library of **100+ ready-to-use code snippets** organized across 12 categories. Snippets save time by providing tested patterns for common operations.

### Accessing Snippets

Open the snippet sidebar from the editor to browse, search, and insert snippets directly into your code.

### Categories

| Category | Examples |
|----------|----------|
| **Boolean & Logic** | Conditional switch, AND, OR, NOT, comparisons, range checks |
| **Math** | Add, subtract, multiply, divide, power, min/max, rounding, clamp |
| **Text** | Uppercase, lowercase, trim, split, join, replace, pad, truncate |
| **Regex** | Pattern match, extract, replace, test, split by regex |
| **List** | Map, filter, reduce, sort, reverse, unique, flatten, chunk, zip |
| **Dictionary** | Keys, values, entries, merge, pick, omit, rename keys |
| **Date & Time** | Format, parse, diff, add/subtract, relative time |
| **UUID** | Generate UUID, validate UUID |
| **HTTP** | GET/POST requests, headers, JSON body, error handling |
| **JSON** | Parse, stringify, pretty-print, deep merge, path access |
| **Data Table** | CSV with headers, custom delimiters, TSV, column extraction |
| **Streaming** | Yield patterns, emit multiple outputs, batch processing |

### Using Snippets

1. **Browse** — scroll through categories or use the search bar
2. **Search** — type keywords to filter by title, description, or tags
3. **Insert** — click a snippet to insert it at the cursor position
4. **Copy** — copy the snippet to clipboard for use elsewhere

Snippets are designed to work with dynamic inputs. For example, the "Conditional Switch" snippet uses variables `condition`, `if_true`, and `if_false` — just add these as dynamic inputs to your node:

```javascript
return { output: condition ? if_true : if_false };
```

---

## AI Assistant

The Code node editor includes a built-in **AI assistant** that can help you write, edit, and debug code. Open it from the Chat button in the toolbar.

### What the AI Can Do

- **Generate code** — describe what you want and the AI writes the JavaScript
- **Edit existing code** — select code and ask the AI to modify it
- **Debug errors** — paste an error message and get suggestions
- **Explain code** — ask the AI to explain what a piece of code does
- **Refactor** — ask for cleaner or more efficient versions of your code

### How to Use

1. **Open the chat panel** — click the Chat icon in the editor toolbar
2. **Type your request** — describe what you want in natural language
3. **Review the result** — the AI reads your current code and makes changes directly in the editor
4. **Iterate** — ask for adjustments until the code is right

### AI Editor Tools

The AI assistant has direct access to the editor and can:

| Capability | Description |
|------------|-------------|
| **Read content** | Read your full code or selected text |
| **Replace all** | Replace the entire document with new code |
| **Replace selection** | Replace only the selected text |
| **Insert at cursor** | Insert new code at the current cursor position |

### Tips

- **Be specific**: "Add error handling to the fetch call" works better than "improve the code"
- **Select first**: Select the code you want to change before asking the AI — it will focus on your selection
- **Use context**: Mention your input variable names so the AI generates code that matches your node's inputs
- **Iterate**: Start with a simple prompt, then refine with follow-up requests

---

## Sandbox Limits

The Code node runs in a secure sandbox with the following safety limits:

| Limit | Value |
|-------|-------|
| Default timeout | 30 seconds |
| Max loop iterations | 10,000 |
| Max fetch requests | 20 per execution |
| Max response body size | 1 MB per fetch |
| Max output size | 100 KB |
| Max sleep duration | 5 seconds |
| `setTimeout` / `setInterval` | Disabled |

These limits protect against runaway code and excessive resource usage.

---

## Examples

### Transform and Filter Data

```javascript
// Input: items (array of objects)
const filtered = items
  .filter(item => item.price > 10)
  .map(item => ({
    name: item.name.toUpperCase(),
    total: item.price * item.quantity
  }));

const totalValue = _.sumBy(filtered, "total");

return { filtered, totalValue };
```

### Scrape a Web Page

```javascript
const response = await fetch(url);
const html = await response.text();
const $ = cheerio.load(html);

const titles = $("h2").map((i, el) => $(el).text().trim()).get();
const links = $("a[href]").map((i, el) => $(el).attr("href")).get();

return { titles, links };
```

### Parse CSV and Aggregate

```javascript
const rows = csvParse(csvText, { columns: true });

const byCategory = _.groupBy(rows, "category");
const summary = _.mapValues(byCategory, group => ({
  count: group.length,
  total: _.sumBy(group, row => parseFloat(row.amount))
}));

return { summary };
```

### Build a JSON API Response

```javascript
const results = await Promise.all(
  urls.map(async (url) => {
    const res = await fetch(url);
    return { url, status: res.status, data: await res.json() };
  })
);

return {
  results,
  successCount: results.filter(r => r.status === 200).length
};
```

### Stream Processing with State

```javascript
// Accumulate a running total across streaming invocations
state.total = (state.total || 0) + value;
state.count = (state.count || 0) + 1;

return {
  value,
  runningTotal: state.total,
  average: state.total / state.count
};
```
