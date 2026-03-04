# Palette's Journal

## 2025-02-27 - Hardcoded tabIndex={-1} in Primitives
**Learning:** Found that UI primitives like `DeleteButton` had `tabIndex={-1}` hardcoded to prevent focus stealing in React Flow canvas, but this broke keyboard accessibility when used in standard UI lists.
**Action:** Default primitives to `tabIndex={0}` (accessible) and explicitly pass `tabIndex={-1}` only when using them inside canvas nodes.

## 2025-05-23 - Inconsistent Accessible Names in Primitives
**Learning:** `RefreshButton` was missing `aria-label` while other primitives had it, causing it to be invisible to screen readers (and Playwright `get_by_role` with name). Even if `Tooltip` is present, the interactive element must have an accessible name.
**Action:** Always verify `aria-label` on icon-only buttons, even if a Tooltip is used.

## 2026-02-27 - Hidden Focus Traps in State Buttons
**Learning:** `StateIconButton` (used for ThemeToggle, AgentMode) had hardcoded `tabIndex={-1}`, making critical global controls keyboard-inaccessible. This pattern of "canvas-first" components breaking standard UI accessibility persists.
**Action:** When auditing UI primitives, check if they are "dual-use" (canvas vs. panel) and ensure `tabIndex` is configurable, defaulting to `0`.
## 2024-06-18 - Missing ARIA Labels on Core UI Primitives
**Learning:** Many core icon-based UI primitives (like `CircularActionButton`, `ToolbarIconButton`, `DownloadButton`, `PlaybackButton`) in this application were missing `aria-label`s, rendering them inaccessible to screen readers despite having visual tooltips. The tooltips were not automatically functioning as accessible names. Furthermore, grouped buttons (like in `ActionButtonGroup`) lacked semantic grouping structure (`role="group"`).
**Action:** When creating or modifying custom icon-only components, always extract the string value from the `tooltip` prop (e.g., `typeof tooltip === 'string' ? tooltip : undefined`) to explicitly set the `aria-label` attribute on the underlying `IconButton` or `button` element. Use `role="group"` and `aria-label` for logical groupings of actions to provide proper context to screen readers.
