# Node.js Dependency Evaluation

Comprehensive evaluation of all third-party Node.js dependencies across the nodetool monorepo. Each dependency is categorized by urgency and actionability.

**Date:** 2026-04-11
**Total third-party dependencies:** ~120 (excluding `@nodetool/*` internal packages)
**Vulnerabilities found:** 27 (5 low, 19 moderate, 3 high)

---

## Table of Contents

1. [Critical: Remove or Replace Immediately](#1-critical-remove-or-replace-immediately)
2. [High: Security Vulnerabilities to Address](#2-high-security-vulnerabilities-to-address)
3. [Medium: Recommended Replacements & Consolidation](#3-medium-recommended-replacements--consolidation)
4. [Low: Minor Improvements](#4-low-minor-improvements)
5. [Good: Dependencies That Are Well-Chosen](#5-good-dependencies-that-are-well-chosen)
6. [Version Inconsistencies](#6-version-inconsistencies)

---

## 1. Critical: Remove or Replace Immediately

### Unused Dependencies (safe to remove from `web/package.json`)

| Package | Version | Reason |
|---------|---------|--------|
| `plotly` | 1.0.6 | Ancient v1 package, never imported. Project uses `plotly.js` v3 via `react-plotly.js` |
| `clipboard-polyfill` | 4.1.0 | Never imported. Code already uses native `navigator.clipboard` API |
| `history` | 5.3.0 | Never imported. `react-router-dom` v7 handles navigation internally |
| `web-worker` | 1.3.0 | Never imported anywhere in the codebase |
| `react-infinite-scroll-component` | 6.1.0 | Never imported. Custom scroll implementation exists using scroll events |

**Estimated savings:** ~5 unnecessary packages removed from the dependency tree.

### Misplaced Dependencies

| Package | Current Location | Should Be |
|---------|-----------------|-----------|
| `mock-socket` (web) | `dependencies` | `devDependencies` — only used in test files |

### Unmaintained / Abandoned Dependencies

| Package | Location | Issue | Recommendation |
|---------|----------|-------|----------------|
| `pdf-parse` | agents | Unmaintained since 2019, no updates in 7 years | Replace with `pdfjs-dist` (already in base-nodes, maintained by Mozilla) |
| `@traceloop/node-server-sdk` | runtime | Never imported, declared but unused. Has known vulnerabilities via transitive `@langchain/core` dependency | Remove entirely — OpenTelemetry integration works directly via `@opentelemetry/*` packages |

---

## 2. High: Security Vulnerabilities to Address

### Direct vulnerabilities

| Package | Severity | Issue | Fix |
|---------|----------|-------|-----|
| `lodash` ^4.17.23 | **High** | Code injection via `_.template`, prototype pollution in `_.unset`/`_.omit` | Upgrade to `>=4.17.24` when available, or replace (see consolidation section) |
| `nodemailer` <=8.0.4 | **Moderate** | SMTP command injection via CRLF in EHLO/HELO | `npm audit fix` — upgrade to `>=8.0.5` |
| `imapflow` 1.0.77-1.2.18 | **Moderate** | Transitive via nodemailer | Upgrades with nodemailer fix |

### Transitive vulnerabilities

| Via Package | Severity | Issue | Fix |
|-------------|----------|-------|-----|
| `esbuild` (via drizzle-kit) | Moderate | Outdated esbuild in drizzle-kit's transitive deps | Upgrade `drizzle-kit` to latest |
| `@hono/node-server` | Moderate | Middleware bypass via repeated slashes | `npm audit fix` |
| `@langchain/core` (via @traceloop) | Moderate | langsmith dependency issue | Remove `@traceloop/node-server-sdk` (unused) |

---

## 3. Medium: Recommended Replacements & Consolidation

### 3a. `keytar` -> Electron `safeStorage` + file-based storage

**Location:** `packages/security`, root `package.json`
**Files using it:** 1 (`packages/security/src/master-key.ts`)

`keytar` is a native C++ module requiring node-gyp compilation. It frequently breaks across Node.js major versions and Electron ABI changes. The codebase already has graceful fallback when keytar is unavailable.

**Recommendation:** Replace with:
- **Electron context:** Use `electron.safeStorage` API (built-in, no native dependency)
- **Server context:** Keep the existing env var / AWS Secrets Manager fallback (already implemented)
- This eliminates a fragile native dependency from the build chain

### 3b. `lodash` / `lodash-es` -> Native JS or lightweight alternatives

**Location:** web (129 files), packages/agents (1 file)
**Functions actually used:** Only 4 — `isEqual` (127 files), `debounce` (5), `throttle` (1), `omit` (1)

| Function | Alternative |
|----------|-------------|
| `isEqual` | [`fast-deep-equal`](https://github.com/epoberezkin/fast-deep-equal) — 6x faster, 0.7KB vs lodash's 25KB+ |
| `debounce` | Already have `use-debounce` in web; or use a 10-line utility |
| `throttle` | 10-line utility function |
| `omit` | Native: `const { key, ...rest } = obj` or `Object.fromEntries(Object.entries(obj).filter(...))` |

**Impact:** Eliminates a high-severity vulnerability dependency. The `lodash-es` import in `packages/agents/src/js-sandbox.ts` (full namespace import exposed to user sandbox) should be evaluated for what sandbox users actually need.

### 3c. Date library consolidation: `luxon` + `date-fns` + `dayjs`

**Current state:** Three date libraries for minimal usage:
- `luxon` — 2 files (date formatting utilities)
- `date-fns` — 3 files (relative time, validation)
- `dayjs` — 1 file (exposed in agent JS sandbox)

**Recommendation:** Consolidate to `date-fns` only:
- Tree-shakeable, smallest per-function bundle size
- Covers all current use cases (formatting, relative time, validation, timezone via `date-fns-tz`)
- `dayjs` in sandbox: provide `date-fns` functions instead, or keep dayjs isolated there since it's for user code
- **Estimated savings:** ~80KB bundle reduction by removing luxon

### 3d. `axios` -> native `fetch` or extend `openapi-fetch`

**Location:** web (7 files, all file download operations)
**Current state:** Project already uses `openapi-fetch` as its primary HTTP client for all API calls. Axios is only used for 7 file download calls with progress tracking.

**Recommendation:** Replace with native `fetch` + `ReadableStream` for progress tracking, or a thin wrapper (~20 lines). Eliminates a 14KB dependency for 7 callsites.

### 3e. `prismjs` + `react-syntax-highlighter` -> consolidate highlighting

**Location:** web
- `react-syntax-highlighter` — 2 files (markdown code blocks)
- `prismjs` + `react-simple-code-editor` — 4 files (Lexical editor, JSON property editors)
- `monaco-editor` — 4 files (full code editor)

**Assessment:** All three serve distinct roles and are needed. However, `react-syntax-highlighter` bundles its own copy of PrismJS/highlight.js. Consider switching markdown code blocks to use PrismJS directly (already loaded) to avoid duplicate highlighting engines.

### 3f. `msgpackr` vs `@msgpack/msgpack` — intentional split

**Current state:**
- `msgpackr` — server-side (websocket package, 8 files) — C++ native bindings, faster
- `@msgpack/msgpack` — client-side (web/mobile/electron, 13 files) — pure JS, browser-compatible

**Assessment:** This split is **correct and intentional**. `msgpackr` uses native bindings for server performance; `@msgpack/msgpack` is the browser-compatible alternative. No action needed.

---

## 4. Low: Minor Improvements

### 4a. `react-is` override

Pinned at 18.3.1 with an npm override. This is a transitive dependency (not directly imported). The override exists for React 19 compatibility with packages that still depend on react-is internally. **Keep until upstream packages update.**

### 4b. `zustand` version split (web v4 vs electron v5)

- **Web:** Pinned at exact `4.5.7` — intentional, due to `zundo` v2 incompatibility with zustand v5
- **Electron:** Uses `^5.0.3` — only 2 files, basic usage

**Assessment:** The pin is correct. Migration to zustand v5 in web/ is blocked by zundo v2's type incompatibilities. **Wait for zundo v3** before upgrading web to zustand v5.

### 4c. `zod` version split (v3 in deploy, v4 everywhere else)

- `packages/deploy` uses `zod ^3.23.0`
- All other packages use `zod ^4.0.0+`

**Recommendation:** Upgrade deploy to zod v4. The package has workaround code already annotated for "Zod v4's type checker", suggesting partial migration was attempted. Complete it to avoid loading two zod versions.

### 4d. `eventemitter3` in web

Used in 2 files for WebSocket event management. Lightweight (5KB) and provides a cleaner API than native `EventTarget`. **Keep** — appropriate for this use case.

### 4e. Consider `playwright` scope

`playwright` is listed as a production dependency in `packages/base-nodes`. If it's used for web scraping nodes (not just testing), this is correct but adds ~100MB+ to the dependency tree. Consider whether a lighter headless browser option or making it an optional dependency would work.

---

## 5. Good: Dependencies That Are Well-Chosen

These dependencies are well-suited for their roles and have no recommended changes:

### Frontend Core
| Package | Assessment |
|---------|------------|
| `react` 19, `react-dom` 19 | Current, stable |
| `@mui/material` 7 | Latest major, actively maintained |
| `@emotion/react`, `@emotion/styled` | Required by MUI 7 |
| `@xyflow/react` 12 | Best-in-class for node graphs |
| `zustand` (with `zundo`) | Excellent state management, appropriate middleware |
| `@tanstack/react-query` 5 | Industry standard for server state |
| `react-router-dom` 7 | Latest, actively maintained |
| `vite` 6 | Fast, modern bundler |

### Frontend Libraries
| Package | Assessment |
|---------|------------|
| `lexical` | Meta's modern rich text editor, good choice over Draft.js/Slate |
| `monaco-editor` | Best embeddable code editor |
| `@xterm/xterm` | Standard terminal emulator for web |
| `dockview` | Good docking layout library |
| `cmdk` | Lightweight command palette |
| `fuse.js` | Fast, lightweight fuzzy search |
| `react-markdown` + `rehype-raw` + `remark-gfm` | Standard markdown rendering stack |
| `wavesurfer.js` | Best audio waveform library |
| `three` + `@react-three/fiber` + `@react-three/drei` | Standard 3D rendering stack |
| `dompurify` | Essential for XSS prevention |
| `react-window` + `react-virtualized-auto-sizer` | Good virtualization approach |
| `zod` 4 | Excellent schema validation |

### Backend Core
| Package | Assessment |
|---------|------------|
| `fastify` 5 | Excellent choice — faster than Express, modern, type-safe |
| `drizzle-orm` + `drizzle-kit` | Modern, type-safe ORM. Good choice over Prisma for this use case |
| `better-sqlite3` + `sqlite-vec` | Fast native SQLite with vector search |
| `jose` | Best JWT library — zero dependencies, Web Crypto based |
| `sharp` | Industry standard image processing |
| `@napi-rs/canvas` | Modern canvas implementation, good napi-rs bindings |
| `dotenv` | Simple, standard env loading |
| `ws` | Standard WebSocket library for Node.js |
| `dockerode` | Standard Docker API client |
| `cheerio` | Fast HTML parsing/querying |

### Backend Specialized
| Package | Assessment |
|---------|------------|
| `@anthropic-ai/sdk` | Official Anthropic SDK |
| `openai` | Official OpenAI SDK |
| `replicate` | Official Replicate SDK |
| `@fal-ai/client` | Official fal.ai SDK |
| `@elevenlabs/elevenlabs-js` | Official ElevenLabs SDK |
| `@modelcontextprotocol/sdk` | Official MCP SDK |
| `node-pty` | Standard pseudo-terminal library |
| `commander` | Standard CLI framework |
| `chalk` | Standard terminal coloring |
| `ink` | React-based CLI rendering, appropriate for the CLI package |

### OpenTelemetry Stack
| Package | Assessment |
|---------|------------|
| `@opentelemetry/api` | Actively used for tracing LLM calls |
| `@opentelemetry/sdk-node` | Core SDK |
| `@opentelemetry/exporter-trace-otlp-proto` | OTLP export |
| `@opentelemetry/resources` | Resource definitions |
| `@opentelemetry/sdk-trace-base` | Trace SDK |
| `@opentelemetry/semantic-conventions` | Standard attribute names |

---

## 6. Version Inconsistencies

These packages have different versions specified across workspaces:

| Package | Locations | Versions | Action |
|---------|-----------|----------|--------|
| `zod` | protocol, web, electron, deploy | v4, v4, v4, **v3** | Upgrade deploy to v4 |
| `zustand` | web, electron | **4.5.7**, ^5.0.3 | Intentional — wait for zundo v3 |
| `@types/node` | various packages | ^20, ^22, ^25 | Align to ^22 (matches Node 22.x engine requirement) |
| `typescript` | various packages | ^5.3.3, ^5.4.0, ^5.4.5, ^5.7.2 | Align to ^5.7 across all packages |
| `vitest` | most packages, kie-codegen, kie-nodes | ^4.1.2, **^1.6.1** | Upgrade kie-* to ^4.1.2 |
| `better-sqlite3` | models, base-nodes, vectorstore, electron | ^12.6.2 to ^12.8.0 | Align to ^12.8.0 |

---

## Summary: Recommended Action Plan

### Phase 1: Quick wins (no code changes)
1. Remove 5 unused web dependencies: `plotly`, `clipboard-polyfill`, `history`, `web-worker`, `react-infinite-scroll-component`
2. Move `mock-socket` from dependencies to devDependencies
3. Remove unused `@traceloop/node-server-sdk` from runtime (fixes 3 transitive vulnerabilities)
4. Run `npm audit fix` to patch `nodemailer`, `@hono/node-server`
5. Align `@types/node`, `typescript`, `vitest` versions across packages

### Phase 2: Targeted replacements (small code changes)
6. Replace `lodash` with `fast-deep-equal` + native utilities (127 files for isEqual, but mechanical find-replace)
7. Replace `pdf-parse` with `pdfjs-dist` in agents (3 files)
8. Replace `axios` with native fetch in web (7 callsites)
9. Upgrade `zod` v3 -> v4 in deploy package (2 files)

### Phase 3: Strategic improvements (larger scope)
10. Consolidate `luxon` + `date-fns` to single date library (5 files total)
11. Replace `keytar` with `electron.safeStorage` + env var fallback (1 file)
12. Evaluate `playwright` as optional dependency in base-nodes
13. Upgrade web to zustand v5 when zundo v3 is available

### Estimated impact
- **Bundle size reduction:** ~150-200KB (lodash, luxon, axios, unused packages)
- **Vulnerability fixes:** Resolves all 27 current audit findings
- **Build reliability:** Removing keytar eliminates native module compilation issues
- **Maintenance burden:** Fewer dependencies to keep updated
