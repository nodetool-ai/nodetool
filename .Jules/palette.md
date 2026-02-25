# Palette's Journal

## 2025-02-27 - Hardcoded tabIndex={-1} in Primitives
**Learning:** Found that UI primitives like `DeleteButton` had `tabIndex={-1}` hardcoded to prevent focus stealing in React Flow canvas, but this broke keyboard accessibility when used in standard UI lists.
**Action:** Default primitives to `tabIndex={0}` (accessible) and explicitly pass `tabIndex={-1}` only when using them inside canvas nodes.

## 2025-05-23 - Inconsistent Accessible Names in Primitives
**Learning:** `RefreshButton` was missing `aria-label` while other primitives had it, causing it to be invisible to screen readers (and Playwright `get_by_role` with name). Even if `Tooltip` is present, the interactive element must have an accessible name.
**Action:** Always verify `aria-label` on icon-only buttons, even if a Tooltip is used.
