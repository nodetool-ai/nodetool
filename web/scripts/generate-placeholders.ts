#!/usr/bin/env npx tsx
/**
 * Generate meaningful placeholder screenshots for NodeTool documentation.
 *
 * Instead of blank/black images, this script creates labeled placeholder PNGs
 * that clearly show which screenshot is missing and what it should contain.
 * Run this whenever a new screenshot is added to the spec but before the app
 * is available to capture the real version.
 *
 * Usage:
 *   npx tsx scripts/generate-placeholders.ts
 *   npx tsx scripts/generate-placeholders.ts --force    # Overwrite all existing
 *   npx tsx scripts/generate-placeholders.ts --list     # List all defined screenshots
 *
 * The real screenshots are captured by:
 *   npx playwright test tests/benchmarks/screenshots.spec.ts --project=chromium
 */

import { chromium } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.join(__dirname, "../../docs/assets/screenshots");
const FORCE = process.argv.includes("--force");
const LIST = process.argv.includes("--list");

// ─── Screenshot manifest ──────────────────────────────────────────────────────
// All screenshots used in the documentation, with dimensions and descriptions.
// Keep this list in sync with tests/benchmarks/screenshots.spec.ts.

interface ScreenshotSpec {
  /** Output filename (relative to docs/assets/screenshots/) */
  filename: string;
  /** Human-readable label shown in the placeholder */
  label: string;
  /** Brief description of what the screenshot shows */
  description: string;
  /** Viewport / image dimensions */
  width: number;
  height: number;
}

const SCREENSHOTS: ScreenshotSpec[] = [
  // Main Pages
  {
    filename: "login-page.png",
    label: "Login Page",
    description: "NodeTool authentication screen",
    width: 1920,
    height: 1080
  },
  {
    filename: "dashboard-overview.png",
    label: "Dashboard Overview",
    description: "Main dashboard with templates and recent workflows",
    width: 1920,
    height: 1080
  },
  {
    filename: "dashboard-workflows.png",
    label: "Dashboard – Workflows",
    description: "Dashboard workflow listing",
    width: 1920,
    height: 1080
  },
  {
    filename: "templates-grid.png",
    label: "Templates Grid",
    description: "Example workflow templates gallery",
    width: 1920,
    height: 1080
  },
  {
    filename: "asset-explorer.png",
    label: "Asset Explorer",
    description: "File and asset browser",
    width: 1920,
    height: 1080
  },
  {
    filename: "collections-explorer.png",
    label: "Collections Explorer",
    description: "Vector collections browser",
    width: 1920,
    height: 1080
  },
  {
    filename: "models-list.png",
    label: "Models List",
    description: "Available AI model list",
    width: 1920,
    height: 1080
  },
  // Chat
  {
    filename: "global-chat-interface.png",
    label: "Global Chat Interface",
    description: "Main chat area with thread list",
    width: 1920,
    height: 1080
  },
  {
    filename: "chat-thread-list.png",
    label: "Chat – Thread List",
    description: "List of past conversation threads",
    width: 1920,
    height: 1080
  },
  {
    filename: "chat-empty-state.png",
    label: "Chat – Empty State",
    description: "Chat landing page with no messages",
    width: 1920,
    height: 1080
  },
  {
    filename: "standalone-chat.png",
    label: "Standalone Chat",
    description: "Full-screen chat without sidebar panels",
    width: 1920,
    height: 1080
  },
  {
    filename: "chat-model-selector.png",
    label: "Chat – Model Selector",
    description: "Model picker dropdown in chat",
    width: 1280,
    height: 720
  },
  {
    filename: "chat-tools-menu.png",
    label: "Chat – Tools Menu",
    description: "Available tools panel in chat",
    width: 1280,
    height: 720
  },
  {
    filename: "agent-mode-enabled.png",
    label: "Agent Mode Enabled",
    description: "Chat with agent/planning mode active",
    width: 1920,
    height: 1080
  },
  {
    filename: "chat-workflow-attached.png",
    label: "Chat – Workflow Attached",
    description: "Chat with a workflow attached as context",
    width: 1920,
    height: 1080
  },
  {
    filename: "chat-rich-content.png",
    label: "Chat – Rich Content",
    description: "Chat messages with images and formatted text",
    width: 1920,
    height: 1080
  },
  {
    filename: "agent-planning.png",
    label: "Agent Planning",
    description: "Agent task decomposition and plan view",
    width: 1920,
    height: 1080
  },
  {
    filename: "chat-mobile.png",
    label: "Chat – Mobile View",
    description: "Chat interface at iPhone X viewport",
    width: 375,
    height: 812
  },
  // Mini-Apps
  {
    filename: "mini-apps-page.png",
    label: "Mini-Apps Page",
    description: "Gallery of published mini-app workflows",
    width: 1920,
    height: 1080
  },
  {
    filename: "mini-app-interface.png",
    label: "Mini-App Interface",
    description: "A running mini-app with form inputs",
    width: 1920,
    height: 1080
  },
  {
    filename: "mini-app-builder.png",
    label: "Mini-App Builder",
    description: "Mini-app editing / builder view",
    width: 1920,
    height: 1080
  },
  // Workflow Editor
  {
    filename: "editor-empty-state.png",
    label: "Editor – Empty State",
    description: "Blank workflow canvas on first open",
    width: 1920,
    height: 1080
  },
  {
    filename: "canvas-workflow.png",
    label: "Canvas Workflow",
    description: "Workflow editor with nodes on the canvas",
    width: 1920,
    height: 1080
  },
  {
    filename: "editor-workflow-view.png",
    label: "Editor – Workflow View",
    description: "Full editor layout with panels",
    width: 1280,
    height: 720
  },
  {
    filename: "node-menu-open.png",
    label: "Node Menu Open",
    description: "Add-node search popup on canvas",
    width: 1920,
    height: 1080
  },
  {
    filename: "node-menu-open-detailed.png",
    label: "Node Menu – Search Results",
    description: "Node search popup with filtered results",
    width: 1280,
    height: 720
  },
  {
    filename: "properties-panel.png",
    label: "Properties Panel",
    description: "Right-side node properties inspector",
    width: 1920,
    height: 1080
  },
  {
    filename: "inspector-panel.png",
    label: "Inspector Panel",
    description: "Node inspector with parameter controls",
    width: 1920,
    height: 1080
  },
  {
    filename: "left-panel-assets.png",
    label: "Left Panel – Assets",
    description: "Left sidebar showing asset browser tab",
    width: 1920,
    height: 1080
  },
  {
    filename: "context-menu-node.png",
    label: "Context Menu – Node",
    description: "Right-click context menu on a node",
    width: 1920,
    height: 1080
  },
  {
    filename: "context-menu-canvas.png",
    label: "Context Menu – Canvas",
    description: "Right-click context menu on empty canvas",
    width: 1920,
    height: 1080
  },
  {
    filename: "workflow-tabs.png",
    label: "Workflow Tabs",
    description: "Multiple open workflow tabs in editor",
    width: 1920,
    height: 1080
  },
  // Header & Navigation
  {
    filename: "app-header.png",
    label: "App Header",
    description: "Top navigation bar with all actions",
    width: 1920,
    height: 56
  },
  {
    filename: "app-layout-annotated.png",
    label: "App Layout – Annotated",
    description: "Full app screenshot with labeled regions",
    width: 1920,
    height: 1080
  },
  {
    filename: "notification-panel.png",
    label: "Notification Panel",
    description: "Notification bell and dropdown panel",
    width: 1920,
    height: 1080
  },
  // Settings
  {
    filename: "settings-dialog.png",
    label: "Settings Dialog",
    description: "Application settings modal",
    width: 1920,
    height: 1080
  },
  {
    filename: "settings-general.png",
    label: "Settings – General",
    description: "General preferences tab",
    width: 1280,
    height: 720
  },
  {
    filename: "settings-api-keys.png",
    label: "Settings – API Keys",
    description: "API key configuration tab",
    width: 1920,
    height: 1080
  },
  {
    filename: "settings-api-secrets.png",
    label: "Settings – Secrets",
    description: "API secrets and tokens tab",
    width: 1280,
    height: 720
  },
  {
    filename: "settings-folders.png",
    label: "Settings – Folders",
    description: "Model storage folder configuration",
    width: 1920,
    height: 1080
  },
  {
    filename: "settings-auth.png",
    label: "Settings – Auth",
    description: "Authentication and user settings",
    width: 1920,
    height: 1080
  },
  {
    filename: "about-menu.png",
    label: "About Menu",
    description: "About / version information panel",
    width: 1920,
    height: 1080
  },
  // Command Menu
  {
    filename: "command-menu.png",
    label: "Command Menu",
    description: "Cmd+K command palette",
    width: 1920,
    height: 1080
  },
  {
    filename: "command-menu-search.png",
    label: "Command Menu – Search",
    description: "Command palette with search query",
    width: 1920,
    height: 1080
  },
  // Dialogs
  {
    filename: "open-create-dialog.png",
    label: "Open / Create Dialog",
    description: "New workflow or open existing dialog",
    width: 1920,
    height: 1080
  },
  {
    filename: "confirm-dialog.png",
    label: "Confirm Dialog",
    description: "Destructive action confirmation dialog",
    width: 1920,
    height: 1080
  },
  {
    filename: "file-browser-dialog.png",
    label: "File Browser Dialog",
    description: "File and asset picker dialog",
    width: 1920,
    height: 1080
  },
  // Assets
  {
    filename: "asset-preview.png",
    label: "Asset Preview",
    description: "Selected asset detail view",
    width: 1920,
    height: 1080
  },
  {
    filename: "asset-context-menu.png",
    label: "Asset Context Menu",
    description: "Right-click menu on an asset item",
    width: 1920,
    height: 1080
  },
  {
    filename: "asset-upload.png",
    label: "Asset Upload",
    description: "Asset upload drag-and-drop area",
    width: 1920,
    height: 1080
  },
  // Models
  {
    filename: "models-manager-full.png",
    label: "Models Manager – Full",
    description: "Complete model management interface",
    width: 1920,
    height: 1080
  },
  {
    filename: "models-filters.png",
    label: "Models – Filters",
    description: "Model list with filter controls",
    width: 1920,
    height: 1080
  },
  {
    filename: "model-card-actions.png",
    label: "Model Card – Actions",
    description: "Model card with hover action buttons",
    width: 1920,
    height: 1080
  },
  {
    filename: "model-manager-starter.png",
    label: "Model Manager – Starter",
    description: "Recommended starter models view",
    width: 1920,
    height: 1080
  },
  // Workflow Features
  {
    filename: "smart-connect.png",
    label: "Smart Connect",
    description: "Drag-to-connect node suggestion popup",
    width: 1920,
    height: 1080
  },
  {
    filename: "node-anatomy-annotated.png",
    label: "Node Anatomy – Annotated",
    description: "Annotated diagram of a workflow node",
    width: 1920,
    height: 1080
  },
  {
    filename: "connection-colors.png",
    label: "Connection Colors",
    description: "Edge color coding by data type",
    width: 1920,
    height: 1080
  },
  {
    filename: "workflow-progress.png",
    label: "Workflow Progress",
    description: "Running workflow with progress indicators",
    width: 1920,
    height: 1080
  },
  {
    filename: "workflow-streaming-output.png",
    label: "Workflow Streaming Output",
    description: "Streaming text output in a Preview node",
    width: 1920,
    height: 1080
  },
  {
    filename: "missing-model.png",
    label: "Missing Model Indicator",
    description: "Node showing missing model warning",
    width: 1920,
    height: 1080
  },
  {
    filename: "auto-layout-comparison.png",
    label: "Auto Layout – Comparison",
    description: "Before/after auto-layout alignment",
    width: 1920,
    height: 1080
  },
  {
    filename: "node-groups.png",
    label: "Node Groups",
    description: "Grouped nodes in a workflow",
    width: 1920,
    height: 1080
  },
  {
    filename: "creative-story-workflow.png",
    label: "Creative Story Workflow",
    description: "StringInput → Agent → Preview example",
    width: 1920,
    height: 1080
  },
  // Key Concepts
  {
    filename: "node-types-overview.png",
    label: "Node Types Overview",
    description: "Grid showing different node categories",
    width: 1920,
    height: 1080
  },
  {
    filename: "data-flow-direction.png",
    label: "Data Flow Direction",
    description: "Left-to-right data flow diagram",
    width: 1920,
    height: 1080
  },
  // Cookbook
  {
    filename: "cookbook-rag-workflow.png",
    label: "Cookbook – RAG Workflow",
    description: "Retrieval-Augmented Generation example",
    width: 1920,
    height: 1080
  },
  {
    filename: "cookbook-image-enhance.png",
    label: "Cookbook – Image Enhancement",
    description: "Image enhancement pipeline example",
    width: 1920,
    height: 1080
  },
  {
    filename: "cookbook-image-to-story.png",
    label: "Cookbook – Image to Story",
    description: "Image captioning workflow example",
    width: 1920,
    height: 1080
  },
  {
    filename: "cookbook-realtime-agent.png",
    label: "Cookbook – Realtime Agent",
    description: "Live agent execution workflow",
    width: 1920,
    height: 1080
  },
  {
    filename: "cookbook-data-viz.png",
    label: "Cookbook – Data Visualization",
    description: "Data analysis and chart pipeline",
    width: 1920,
    height: 1080
  },
  // Responsive Views
  {
    filename: "dashboard-mobile.png",
    label: "Dashboard – Mobile",
    description: "Dashboard at 375×812 (iPhone X)",
    width: 375,
    height: 812
  },
  {
    filename: "dashboard-tablet.png",
    label: "Dashboard – Tablet",
    description: "Dashboard at 768×1024 (iPad)",
    width: 768,
    height: 1024
  },
  {
    filename: "editor-wide.png",
    label: "Editor – Wide",
    description: "Workflow editor at 2560×1440 (2K)",
    width: 2560,
    height: 1440
  },
  // Panel States
  {
    filename: "panel-left-collapsed.png",
    label: "Left Panel – Collapsed",
    description: "Editor with left sidebar collapsed",
    width: 1920,
    height: 1080
  },
  {
    filename: "panel-right-expanded.png",
    label: "Right Panel – Expanded",
    description: "Editor with inspector panel open",
    width: 1920,
    height: 1080
  },
  {
    filename: "log-panel.png",
    label: "Log Panel",
    description: "Bottom log / output panel open",
    width: 1920,
    height: 1080
  },
  {
    filename: "system-stats.png",
    label: "System Stats",
    description: "GPU/CPU usage statistics panel",
    width: 1920,
    height: 1080
  },
  // Workflow Assistant
  {
    filename: "workflow-assistant-chat.png",
    label: "Workflow Assistant Chat",
    description: "In-editor AI workflow assistant",
    width: 1920,
    height: 1080
  },
  // HuggingFace
  {
    filename: "huggingface-browser.png",
    label: "HuggingFace Browser",
    description: "HuggingFace model search and download",
    width: 1920,
    height: 1080
  },
  // Error States
  {
    filename: "error-404.png",
    label: "404 – Page Not Found",
    description: "Not-found error page",
    width: 1920,
    height: 1080
  },
  {
    filename: "connection-error.png",
    label: "Connection Error",
    description: "Backend connection failure state",
    width: 1920,
    height: 1080
  },
  // Loading States
  {
    filename: "dashboard-loading.png",
    label: "Dashboard – Loading",
    description: "Dashboard initial loading skeleton",
    width: 1920,
    height: 1080
  },
  {
    filename: "editor-loading.png",
    label: "Editor – Loading",
    description: "Workflow editor loading spinner",
    width: 1920,
    height: 1080
  },
  // Theme Variations
  {
    filename: "dashboard-dark-theme.png",
    label: "Dashboard – Dark Theme",
    description: "Dashboard with dark colour scheme",
    width: 1920,
    height: 1080
  },
  {
    filename: "editor-dark-theme.png",
    label: "Editor – Dark Theme",
    description: "Workflow editor with dark colour scheme",
    width: 1920,
    height: 1080
  },
  // Isolated Component Previews (via /preview routes)
  {
    filename: "component-app-header.png",
    label: "Component: App Header",
    description: "Isolated app header bar (via /preview/app-header)",
    width: 1920,
    height: 80
  },
  {
    filename: "component-dashboard.png",
    label: "Component: Dashboard",
    description: "Isolated dashboard page (via /preview/dashboard)",
    width: 1920,
    height: 1080
  },
  {
    filename: "component-models.png",
    label: "Component: Models Manager",
    description: "Isolated models manager (via /preview/models)",
    width: 1920,
    height: 1080
  },
  {
    filename: "component-assets.png",
    label: "Component: Asset Explorer",
    description: "Isolated asset explorer (via /preview/assets)",
    width: 1920,
    height: 1080
  },
  {
    filename: "component-preview-index.png",
    label: "Component Preview Index",
    description: "Preview gallery index page (via /preview)",
    width: 1920,
    height: 1080
  }
];

// ─── Placeholder HTML template ────────────────────────────────────────────────

function buildPlaceholderHtml(spec: ScreenshotSpec): string {
  const { label, description, width, height } = spec;
  const filename = spec.filename;
  const isNarrow = width < 600;
  const fontSize = isNarrow ? 14 : Math.min(32, Math.floor(width / 30));
  const descSize = Math.max(10, Math.floor(fontSize * 0.55));

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${width}px; height: ${height}px; overflow: hidden; }
  body {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0F172A;
    font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
    color: #CBD5E1;
  }
  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: ${isNarrow ? 6 : 12}px;
    padding: ${isNarrow ? "16px 12px" : "40px 60px"};
    border: 1.5px solid #334155;
    border-radius: ${isNarrow ? 6 : 12}px;
    background: #1E293B;
    max-width: ${Math.min(width * 0.85, 800)}px;
    text-align: center;
  }
  .badge {
    font-size: ${Math.max(8, descSize - 2)}px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #60A5FA;
    background: #1D3A5F;
    padding: 2px 8px;
    border-radius: 4px;
  }
  .title {
    font-size: ${fontSize}px;
    font-weight: 700;
    color: #F1F5F9;
    line-height: 1.25;
  }
  .desc {
    font-size: ${descSize}px;
    color: #94A3B8;
    line-height: 1.5;
  }
  .meta {
    font-size: ${Math.max(8, descSize - 2)}px;
    color: #475569;
    margin-top: ${isNarrow ? 2 : 6}px;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }
  .icon {
    font-size: ${Math.min(48, fontSize * 1.5)}px;
    line-height: 1;
    opacity: 0.4;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="badge">Screenshot Placeholder</div>
    <div class="icon">📸</div>
    <div class="title">${htmlEscape(label)}</div>
    ${description ? `<div class="desc">${htmlEscape(description)}</div>` : ""}
    <div class="meta">${htmlEscape(filename)} &nbsp;·&nbsp; ${width}×${height}</div>
  </div>
</body>
</html>`;
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Placeholder manifest ─────────────────────────────────────────────────────
// We track which files were generated by this script in a JSON manifest.
// Any file NOT in the manifest (or missing) is treated as a placeholder that
// needs to be generated. Files ARE in the manifest with placeholder=false are
// real screenshots that must not be overwritten.

const MANIFEST_PATH = path.join(SCREENSHOTS_DIR, ".placeholder-manifest.json");

interface ManifestEntry {
  /** True if this is a generated placeholder (not a real screenshot) */
  placeholder: boolean;
  /** ISO timestamp of generation */
  generatedAt?: string;
}

type Manifest = Record<string, ManifestEntry>;

function readManifest(): Manifest {
  if (!fs.existsSync(MANIFEST_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8")) as Manifest;
  } catch {
    return {};
  }
}

function writeManifest(manifest: Manifest): void {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
}

function isPlaceholder(filepath: string, manifest: Manifest): boolean {
  if (!fs.existsSync(filepath)) return true;
  const filename = path.basename(filepath);
  const entry = manifest[filename];
  // If we have no manifest entry, check if it looks like an old black placeholder
  // by seeing if it's unreasonably small for a 1920x1080 PNG (< 20 KB)
  if (!entry) {
    const stat = fs.statSync(filepath);
    return stat.size < 20_000;
  }
  return entry.placeholder === true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const manifest = readManifest();

  if (LIST) {
    console.log(`\n📋 Defined screenshots (${SCREENSHOTS.length} total):\n`);
    for (const s of SCREENSHOTS) {
      const filepath = path.join(SCREENSHOTS_DIR, s.filename);
      const exists = fs.existsSync(filepath);
      const placeholder = isPlaceholder(filepath, manifest);
      const status = !exists
        ? "❌ missing"
        : placeholder
          ? "🔶 placeholder"
          : "✅ real";
      console.log(`  ${status}  ${s.filename.padEnd(45)} ${s.width}×${s.height}`);
    }
    const missing = SCREENSHOTS.filter(
      (s) => !fs.existsSync(path.join(SCREENSHOTS_DIR, s.filename))
    );
    const placeholders = SCREENSHOTS.filter((s) => {
      const fp = path.join(SCREENSHOTS_DIR, s.filename);
      return isPlaceholder(fp, manifest);
    });
    const real = SCREENSHOTS.length - missing.length - placeholders.length;
    console.log(
      `\n  Summary: ${real} real  |  ${placeholders.length} placeholder  |  ${missing.length} missing\n`
    );
    return;
  }

  const targets = SCREENSHOTS.filter((s) => {
    if (FORCE) return true;
    const fp = path.join(SCREENSHOTS_DIR, s.filename);
    return isPlaceholder(fp, manifest);
  });

  if (targets.length === 0) {
    console.log("✅ All screenshots already have real images. Nothing to do.");
    console.log(
      "   Run with --force to regenerate all placeholders regardless."
    );
    return;
  }

  console.log(
    `\n🎨 Generating ${targets.length} placeholder image(s)...\n`
  );

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  let generated = 0;

  for (const spec of targets) {
    const filepath = path.join(SCREENSHOTS_DIR, spec.filename);
    const html = buildPlaceholderHtml(spec);

    const page = await context.newPage();
    await page.setViewportSize({ width: spec.width, height: spec.height });
    await page.setContent(html, { waitUntil: "load" });
    await page.screenshot({ path: filepath });
    await page.close();

    // Record in manifest so future runs know this is a placeholder
    manifest[spec.filename] = {
      placeholder: true,
      generatedAt: new Date().toISOString()
    };

    console.log(`  ✅ ${spec.filename} (${spec.width}×${spec.height})`);
    generated++;
  }

  await context.close();
  await browser.close();

  // Persist the updated manifest
  writeManifest(manifest);

  console.log(
    `\n✨ Done!  Generated: ${generated}\n`
  );
  console.log("To capture real screenshots from the running app:");
  console.log(
    "  npx playwright test tests/benchmarks/screenshots.spec.ts --project=chromium\n"
  );
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
