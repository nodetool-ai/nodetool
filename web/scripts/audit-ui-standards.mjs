#!/usr/bin/env node
/**
 * Audit web/src against the element standards in docs/DESIGN.md
 * ("Element standards"). Each rule here has the id the standards table names
 * in its "Check" column, so a row of the table and a line of this report
 * point at the same thing.
 *
 * The token rules (spacing, color, radius, font size, z-index, motion) are
 * enforced by `npm run lint:design`. This script covers what that lint cannot
 * see: an element built by hand where a primitive exists, a primitive
 * restyled at the call site, and copy that breaks the rules. Matches are
 * pattern-based, so counts are approximate and meant for ranking. A rule is a
 * candidate for the lint once its count reaches zero.
 *
 * Usage:
 *   node scripts/audit-ui-standards.mjs            summary per element
 *   node scripts/audit-ui-standards.mjs --rule id  every hit of one rule
 *   node scripts/audit-ui-standards.mjs --all      every hit of every rule
 *   node scripts/audit-ui-standards.mjs --json     machine-readable output
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(WEB, "src");

// Files that implement the standards, and code that is not product UI.
const SKIP_DIRS = [
  "components/ui_primitives/",
  "components/editor_ui/",
  "components/themes/",
  "components/preview/",
  // Vendored FableSynth device faces keep their hardware skin (see its README).
  "components/timeline/daw/fablesynth/",
  "components/demo/",
  "stories/",
  "e2e_runner/",
  "__tests__/",
  "__mocks__/"
];
const SKIP_FILE = /(\.(test|spec|stories)\.[jt]sx?|demo-entry\.tsx)$/;

/**
 * Each rule: id (named in DESIGN.md), element (the standards row), what it
 * finds, the fix, and a test. `line` tests one line; `tag` tests the whole
 * opening tag of the listed JSX components; `block` tests a window of lines.
 * `files` narrows the rule to .tsx/.ts/.css.
 */
const RULES = [
  // Buttons
  {
    id: "button/raw-icon-button",
    element: "Buttons",
    finds: "MUI IconButton at a call site",
    fix: "ToolbarIconButton, or CloseButton/DeleteButton/CopyButton",
    line: /<IconButton\b/
  },
  {
    id: "button/restyled",
    element: "Buttons",
    finds: "Button or EditorButton with height, padding, radius or font size in sx",
    fix: "pick size/density/variant; sx carries layout only",
    tag: ["Button", "EditorButton"],
    test: /sx=\{[\s\S]*\b(height|minHeight|padding|px|py|borderRadius|fontSize)\s*:/
  },
  {
    id: "button/native-no-type",
    element: "Buttons",
    finds: "native <button> without type",
    fix: "EditorButton, or type=\"button\" on a whole-surface tile",
    tag: ["button"],
    test: (t) => !/\btype=/.test(t)
  },
  {
    id: "button/icon-fontsize",
    element: "Buttons",
    finds: "fontSize on an icon passed as startIcon/endIcon",
    fix: "pass the bare icon; the theme sizes it",
    line: /(startIcon|endIcon)=\{<\w+Icon[^>]*fontSize=/
  },
  // Tooltips
  {
    id: "tooltip/native-title",
    element: "Tooltips",
    finds: "native title= on a control",
    fix: "tooltip prop or Tooltip",
    tag: ["button", "IconButton", "Button", "EditorButton", "Box", "div", "span", "FlexRow", "FlexColumn"],
    test: (t) =>
      /\stitle=[{"]/.test(t) &&
      (/^<(button|IconButton|Button|EditorButton)\b/.test(t) || /\s(onClick|role=["']button)/.test(t))
  },
  {
    id: "tooltip/custom-delay",
    element: "Tooltips",
    finds: "enterDelay/enterNextDelay set at a call site",
    fix: "theme default, or TOOLTIP_DESCRIPTION_DELAY",
    line: /\benter(Next)?Delay=\{(?!TOOLTIP_)/
  },
  {
    id: "tooltip/shortcut-in-text",
    element: "Tooltips",
    finds: "shortcut written into tooltip text",
    fix: "shortcut prop",
    line: /(tooltip|title)=["{][^"}]*\((Ctrl|Cmd|⌘|Shift|Alt)\b/
  },
  // Chips
  {
    id: "chip/restyled",
    element: "Chips",
    finds: "Chip with height, radius, font size or padding in sx",
    fix: "compact, color, accent, active",
    tag: ["Chip"],
    test: /sx=\{[\s\S]*\b(height|borderRadius|fontSize|padding|px|py)\s*:/
  },
  {
    id: "chip/hand-pill",
    element: "Chips",
    finds: "pill radius outside Chip/StatusPill",
    fix: "Chip, StatusPill, CountBadge",
    line: /BORDER_RADIUS\.pill/
  },
  // Dialogs
  {
    id: "dialog/raw-parts",
    element: "Dialogs",
    finds: "DialogTitle/DialogContent/DialogActions at a call site",
    fix: "Dialog title/children/actions props",
    line: /<Dialog(Title|Content|Actions|ContentText)\b/
  },
  {
    id: "dialog/browser-dialog",
    element: "Dialogs",
    finds: "window.confirm/prompt/alert",
    fix: "ConfirmDialog or requestConfirm",
    line: /\bwindow\.(confirm|prompt|alert)\s*\(/
  },
  {
    id: "dialog/restyled-paper",
    element: "Dialogs",
    finds: "Dialog shell restyled through PaperProps/slotProps.paper",
    fix: "Dialog as is; maxWidth for size",
    tag: ["Dialog"],
    test: /PaperProps=|slotProps=\{\{[\s\S]*paper\s*:/
  },
  // Menus
  {
    id: "menu/raw-menu-item",
    element: "Menus",
    finds: "MUI MenuItem at a call site",
    fix: "MenuItemPrimitive (or ContextMenuItem)",
    line: /<MenuItem\b/
  },
  {
    id: "menu/raw-menu",
    element: "Menus",
    finds: "MUI Menu at a call site",
    fix: "ContextMenu (position or anchorEl) or EditorMenu",
    line: /<Menu\b/
  },
  // Notifications and banners
  {
    id: "notification/snackbar",
    element: "Notifications",
    finds: "a Snackbar of its own",
    fix: "addNotification / useAlertNotifier",
    line: /<Snackbar\b/
  },
  {
    id: "banner/raw-alert",
    element: "Banners",
    finds: "MUI Alert at a call site",
    fix: "AlertBanner",
    line: /<Alert\b(?!Banner)/
  },
  // Forms
  {
    id: "form/raw-text-field",
    element: "Text fields",
    finds: "MUI TextField at a call site",
    fix: "TextInput, TextArea, NumberField, SearchInput",
    line: /<TextField\b/
  },
  {
    id: "form/raw-input",
    element: "Text fields",
    finds: "native <input> for text or numbers",
    fix: "TextInput, NumberField, SearchInput, InlineEditableText",
    tag: ["input"],
    test: (t) => !/type=["{]?["']?(file|checkbox|radio|color|hidden)/.test(t)
  },
  {
    id: "form/number-input",
    element: "Number fields",
    finds: "type=\"number\" field",
    fix: "NumberField",
    files: /\.tsx$/,
    line: /type=["']number["']/
  },
  {
    id: "form/field-chrome-override",
    element: "Text fields",
    finds: "override of .MuiOutlinedInput/.MuiInputBase/.MuiSelect/.MuiInputLabel",
    fix: "field primitive as is; set width only",
    line: /["'`&]\s*\.?Mui(OutlinedInput|InputBase|Select|InputLabel)-/
  },
  {
    id: "form/native-select",
    element: "Selects",
    finds: "native <select>",
    fix: "SelectField, InspectorSelect, NodeSelect",
    line: /<select\b/
  },
  {
    id: "form/raw-select",
    element: "Selects",
    finds: "MUI Select at a call site",
    fix: "SelectField, InspectorSelect, NodeSelect",
    line: /<Select\b(?!Field)/
  },
  {
    id: "form/raw-switch",
    element: "Switches and checkboxes",
    finds: "bare Switch",
    fix: "LabeledSwitch, InspectorToggleRow, NodeSwitch",
    line: /<Switch\b/
  },
  {
    id: "form/range-input",
    element: "Sliders",
    finds: "type=\"range\" input",
    fix: "Slider / NodeSlider",
    line: /type=["']range["']/
  },
  // Tabs
  {
    id: "tabs/raw-tabs",
    element: "Tabs",
    finds: "MUI Tabs/Tab at a call site",
    fix: "TabGroup + TabPanel, DockTabStrip",
    line: /<Tabs?\b(?![A-Za-z])/
  },
  {
    id: "tabs/hand-tablist",
    element: "Tabs",
    finds: "hand-built role=\"tablist\"",
    fix: "TabGroup",
    line: /role=["']tablist["']/
  },
  // States
  {
    id: "state/raw-spinner",
    element: "Loading",
    finds: "CircularProgress at a call site",
    fix: "LoadingSpinner",
    line: /<CircularProgress\b/
  },
  {
    id: "state/raw-linear-progress",
    element: "Progress",
    finds: "LinearProgress at a call site",
    fix: "ProgressBar",
    line: /<LinearProgress\b/
  },
  {
    id: "state/loading-text",
    element: "Loading",
    finds: "bare Loading text",
    fix: "LoadingSpinner with text",
    line: />\s*Loading(\.\.\.|…)?\s*</
  },
  {
    id: "state/error-text",
    element: "Errors",
    finds: "error shown as red text",
    fix: "AlertBanner, or EmptyState variant=\"error\"",
    line: /<(Text|Caption|Label|Typography)\b[^>]*color=["']error/
  },
  // Text
  {
    id: "text/raw-typography",
    element: "Text",
    finds: "MUI Typography at a call site",
    fix: "Text, Label, Caption",
    line: /<Typography\b/
  },
  {
    id: "text/hand-truncation",
    element: "Text",
    finds: "hand-written textOverflow ellipsis",
    fix: "TruncatedText",
    line: /textOverflow:\s*["']ellipsis/
  },
  {
    id: "text/hand-eyebrow",
    element: "Section headers",
    finds: "hand-set uppercase label",
    fix: "SectionHeader size=\"small\", FormSection, InspectorSectionTitle, or EYEBROW",
    files: /\.tsx?$/,
    line: /textTransform:\s*["']uppercase/
  },
  {
    id: "text/raw-heading",
    element: "Page headers",
    finds: "raw <h1>-<h4>",
    fix: "PageHeader, SectionHeader, Text component=\"h2\"",
    line: /<h[1-4]\b/
  },
  // Lists, grids, cards
  {
    id: "list/raw-list",
    element: "Lists",
    finds: "MUI List/ListItem at a call site",
    fix: "VirtualList, selectableRowStyles, ListPanelItem, MenuItemPrimitive",
    line: /<(List|ListItem|ListItemButton)\b/
  },
  {
    id: "card/hand-built",
    element: "Cards",
    finds: "style block with border, radius and background together",
    fix: "Card",
    block: 6,
    files: /\.tsx?$/,
    test: (w) =>
      /\bborder\s*:\s*[`"']?(1px|`1px)/.test(w) &&
      /\bborderRadius\s*:(?!\s*BORDER_RADIUS\.(circle|pill))/.test(w) &&
      /\b(backgroundColor|background|bgcolor)\s*:/.test(w)
  },
  {
    id: "table/raw-table",
    element: "Tables",
    finds: "MUI Table or <table> at a call site",
    fix: "DataTable",
    line: /<(Table|table)\b(?![A-Za-z])/
  },
  // Media and viewers
  {
    id: "media/raw-video",
    element: "Viewers and media",
    finds: "raw <video>",
    fix: "VideoPlayer or MediaThumbnail interactive",
    line: /<video\b/
  },
  {
    id: "media/raw-audio",
    element: "Viewers and media",
    finds: "raw <audio>",
    fix: "AudioPlayback",
    line: /<audio\b/
  },
  {
    id: "media/raw-img",
    element: "Viewers and media",
    finds: "raw <img>",
    fix: "ResponsiveImage, MediaThumbnail",
    line: /<img\b/
  },
  // Links
  {
    id: "link/raw-anchor",
    element: "Links",
    finds: "raw <a href>",
    fix: "TextLink, ExternalLink",
    line: /<a\s[^>]*href=/
  },
  // Layout
  {
    id: "layout/raw-paper",
    element: "Surfaces",
    finds: "MUI Paper at a call site",
    fix: "Surface, Card, Panel",
    line: /<Paper\b/
  },
  {
    id: "layout/raw-accordion",
    element: "Collapsible sections",
    finds: "MUI Accordion at a call site",
    fix: "CollapsibleSection, InspectorSection",
    line: /<Accordion\b/
  },
  {
    id: "layout/raw-drawer",
    element: "Sheets and drawers",
    finds: "MUI Drawer / SwipeableDrawer at a call site",
    fix: "MobileBottomSheet, ResizableDock",
    line: /<(Swipeable)?Drawer\b/
  },
  {
    id: "surface/grey-chrome",
    element: "Surfaces",
    finds: "grey[700-900] as a background or border",
    fix: "background.paper/default, divider, c_scrim",
    line: /\b(background|backgroundColor|bgcolor|border\w*)\s*:.*grey\[[789]00\]/
  },
  // Icons
  {
    id: "icon/hand-size",
    element: "Icons",
    finds: "icon sized by hand",
    fix: "fontSize=\"small\"|\"inherit\", or the primitive that hosts it",
    line: /<\w+Icon\b[^>]*sx=\{\{[^}]*fontSize:\s*[\d"']/
  },
  {
    id: "icon/variant",
    element: "Icons",
    finds: "filled or Rounded glyph for a role that uses the Outlined one",
    fix: "DeleteOutline, CloseOutlined, AddOutlined, FolderOutlined, EditOutlined, InfoOutlined",
    line: /icons-material\/(Delete|Close|Add|Folder|Edit|Info)(Rounded)?["']/
  },
  // Copy
  {
    id: "copy/title-case",
    element: "Copy",
    finds: "Title Case label, tooltip, title or placeholder",
    fix: "sentence case",
    locale: /^([A-Z][a-z]+)( (?!To\b)[A-Z][a-z]+)+$/,
    line: /\b(label|title|tooltip|placeholder|aria-label|confirmText)=["']([A-Z][a-z]+)( (?!To\b|To$)[A-Z][a-z]+)+["']/
  },
  {
    id: "copy/three-dots",
    element: "Copy",
    finds: "three dots instead of …",
    fix: "…",
    locale: /[A-Za-z]\.\.\./,
    line: /["'>][^"'<>]*[A-Za-z]\.\.\.["'<]/
  }
];

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const rel = relative(SRC, p).split("\\").join("/");
    const st = statSync(p);
    if (st.isDirectory()) {
      if (SKIP_DIRS.some((d) => (rel + "/").includes(d))) continue;
      walk(p, out);
    } else if (/\.(tsx|ts|css)$/.test(name) && !SKIP_FILE.test(name) && !name.endsWith(".d.ts")) {
      out.push(p);
    }
  }
  return out;
}

/** Opening tags of the given JSX names, with the line each starts on. */
function openingTags(text, names) {
  const re = new RegExp(`<(${names.join("|")})(?=[\\s>/])`, "g");
  const tags = [];
  let m;
  while ((m = re.exec(text))) {
    let depth = 0;
    let quote = null;
    let i = m.index + 1;
    for (; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (c === quote && text[i - 1] !== "\\") quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    const line = text.slice(0, m.index).split("\n").length;
    tags.push({ tag: text.slice(m.index, i + 1), line });
  }
  return tags;
}

function isComment(line) {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

function audit() {
  const files = walk(SRC, []);
  const hits = Object.fromEntries(RULES.map((r) => [r.id, []]));
  for (const file of files) {
    const rel = relative(WEB, file).split("\\").join("/");
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    const isCss = file.endsWith(".css");
    for (const rule of RULES) {
      if (rule.files && !rule.files.test(file)) continue;
      if (isCss && !rule.line && !rule.block) continue;
      if (rule.line) {
        lines.forEach((l, i) => {
          if (!isComment(l) && rule.line.test(l)) {
            hits[rule.id].push({ file: rel, line: i + 1, text: l.trim() });
          }
        });
      } else if (rule.tag) {
        if (isCss) continue;
        for (const { tag, line } of openingTags(text, rule.tag)) {
          const ok = typeof rule.test === "function" ? rule.test(tag) : rule.test.test(tag);
          if (ok) hits[rule.id].push({ file: rel, line, text: tag.split("\n")[0].trim() });
        }
      } else if (rule.block) {
        let last = -Infinity;
        // Anchor on the radius line and look at the lines around it.
        for (let i = 0; i < lines.length; i++) {
          if (i < last + rule.block || !/\bborderRadius\s*:/.test(lines[i])) continue;
          const window = lines.slice(Math.max(0, i - rule.block), i + rule.block).join("\n");
          if (rule.test(window)) {
            hits[rule.id].push({ file: rel, line: i + 1, text: lines[i].trim() });
            last = i;
          }
        }
      }
    }
  }
  // Most visible copy lives in the English locale, keyed by component.
  const locale = join(SRC, "i18n/locales/en.json");
  const strings = [];
  (function flatten(o, path) {
    for (const [k, v] of Object.entries(o)) {
      const key = path ? `${path}.${k}` : k;
      if (v && typeof v === "object") flatten(v, key);
      else strings.push([key, String(v)]);
    }
  })(JSON.parse(readFileSync(locale, "utf8")), "");
  for (const rule of RULES) {
    if (!rule.locale) continue;
    for (const [key, value] of strings) {
      if (rule.locale.test(value)) {
        hits[rule.id].push({ file: "src/i18n/locales/en.json", line: key, text: `${key} = ${value}` });
      }
    }
  }
  return { files: files.length, hits };
}

const args = process.argv.slice(2);
const { files, hits } = audit();

if (args.includes("--json")) {
  const out = RULES.map(({ id, element, finds, fix }) => ({ id, element, finds, fix, count: hits[id].length, hits: hits[id] }));
  process.stdout.write(JSON.stringify({ scanned: files, rules: out }, null, 2) + "\n");
  process.exit(0);
}

const only = args.includes("--rule") ? args[args.indexOf("--rule") + 1] : null;
const all = args.includes("--all");

if (only || all) {
  for (const r of RULES) {
    if (only && r.id !== only) continue;
    console.log(`\n## ${r.id} (${hits[r.id].length}) — ${r.finds} → ${r.fix}`);
    for (const h of hits[r.id]) console.log(`${h.file}:${h.line}  ${h.text.slice(0, 140)}`);
  }
  process.exit(0);
}

console.log(`Scanned ${files} files under web/src (primitives, themes, tests and stories excluded).\n`);
const elements = [...new Set(RULES.map((r) => r.element))];
for (const r of elements.flatMap((e) => RULES.filter((x) => x.element === e))) {
  if (r === RULES.find((x) => x.element === r.element)) console.log(`\n${r.element}`);
  const byFile = {};
  for (const h of hits[r.id]) byFile[h.file] = (byFile[h.file] || 0) + 1;
  const top = Object.entries(byFile)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([f, n]) => `${f.replace("src/components/", "")} (${n})`)
    .join(", ");
  console.log(`  ${String(hits[r.id].length).padStart(5)}  ${r.id.padEnd(30)} ${Object.keys(byFile).length} files  ${top}`);
}
console.log("\nList every hit of one rule with --rule <id>. Fixes are in docs/DESIGN.md, Element standards.");
