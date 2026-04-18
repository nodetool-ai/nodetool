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
## 2024-03-04 - ARIA Labels on Material-UI Switch Components
**Learning:** For Material UI `<Switch>` components, particularly those without wrapping `FormControlLabel` (like icon toggles), an `inputProps={{ "aria-label": "..." }}` must be explicitly provided for screen readers to recognize the toggle's purpose.
**Action:** When adding or auditing `<Switch>` components that toggle visual modes or act as standalone icons, always apply descriptive `inputProps` for accessibility.
## 2023-10-27 - Explicit tabIndex={0} on native buttons is a functional no-op
**Learning:** Adding `tabIndex={0}` to components that wrap native HTML buttons or MUI `IconButton` elements does not actively change or improve keyboard accessibility, as they are inherently focusable and included in the tab order by default. It fails the requirement to provide an "immediate, visible impact" on UX.
**Action:** Focus on semantic accessibility improvements, such as ensuring screen readers receive appropriate context (e.g., dynamically generating `aria-label` for stateful or count-based components like `NotificationBadge`), rather than redundant HTML attributes. When writing verification scripts for the `/layouttest` page, remember to write logic to switch to the correct tab category before trying to select elements.
## 2024-04-10 - Adding role="status" to Empty States
**Learning:** For dynamically rendered empty state components like `EmptyState`, screen readers may not announce the content when it appears, leaving users unaware of the state change.
**Action:** Always add `role="status"` and `aria-live="polite"` to empty states to ensure screen readers announce them appropriately.

## 2026-03-27 - Adding ARIA labels to ToolbarIconButton and StateIconButton with complex Tooltips
**Learning:** `StateIconButton` and `ToolbarIconButton` try to automatically extract an `aria-label` from their `tooltip` prop (`typeof tooltip === 'string' ? tooltip : undefined`). However, when the `tooltip` prop receives a ReactNode (like a formatted complex tooltip with a title and shortcut), the `aria-label` becomes `undefined`, leaving the icon button inaccessible to screen readers.
**Action:** When using `StateIconButton` or `ToolbarIconButton` with a ReactNode tooltip, always explicitly provide the `ariaLabel` prop with a descriptive string.
## 2026-03-27 - Adding ARIA labels to ToolbarIconButton with complex Tooltips
**Learning:** `ToolbarIconButton` extracts an `aria-label` from its `tooltip` prop automatically (`typeof tooltip === 'string' ? tooltip : undefined`). However, when the `tooltip` prop receives a ReactNode (like a formatted complex tooltip with a title and shortcut), the `aria-label` becomes `undefined`, leaving the icon button inaccessible to screen readers.
**Action:** When using `ToolbarIconButton` with a ReactNode tooltip, always explicitly provide the `ariaLabel` prop with a descriptive string. I've updated `ToolbarIconButton` to explicitly support the `ariaLabel` prop to fix this issue going forward.

## 2026-03-27 - Adding ARIA labels to CircularActionButton and DeleteButton with complex Tooltips
**Learning:** Similar to `ToolbarIconButton` and `StateIconButton`, `CircularActionButton` and `DeleteButton` try to automatically extract an `aria-label` from their `tooltip` prop. If the `tooltip` prop receives a ReactNode, the `aria-label` becomes `undefined` or falls back to generic text, leaving the icon button inaccessible to screen readers or lacking specific context.
**Action:** When using `CircularActionButton` or `DeleteButton` with a ReactNode tooltip, always explicitly provide the `ariaLabel` prop with a descriptive string. I've updated these components to explicitly support the `ariaLabel` prop.
## 2025-02-12 - Added missing `aria-label`s to `IconButton` components
**Learning:** Found that custom/complex components wrapped in MUI `IconButton` often drop context needed for screen readers if only icon nodes are provided as children, creating empty access labels for crucial UI actions.
**Action:** When creating action buttons consisting strictly of an icon, ensure to explicitly pass an `aria-label` attribute on the bounding `IconButton` component to preserve accessibility.
