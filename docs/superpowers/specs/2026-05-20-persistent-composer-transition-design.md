# Persistent Composer Transition (Start Page → Chat)

**Date:** 2026-05-20
**Status:** Design — awaiting review
**Area:** `web/src/components/chat`, `web/src/components/portal`, `web/src/index.tsx`

## Problem

Typing a prompt on the start page (`/dashboard`, rendered by `Portal`) and submitting
produces a jarring transition into the chat UI (`/chat/:thread_id`, rendered by
`GlobalChat`): the whole start page fades/scales/blurs out, the route unmounts, and a
brand-new chat screen — with a *different* composer instance — fades in. The composer the
user just typed in is destroyed and recreated at a new position. It reads as "the UI
disappears and comes back."

### Root cause

There are two separate composer instances on two sibling routes:

- `/dashboard` → `Portal.tsx` renders its own `<ChatInputSection>`
  (`web/src/components/portal/Portal.tsx:462`).
- `/chat/:thread_id` → `GlobalChat` → `ChatView` renders a different `<ChatInputSection>`
  (`web/src/components/chat/containers/ChatView.tsx`).

On submit, `Portal.handleSendMessage` (`Portal.tsx:325`) sets `isTransitioning`, runs the
`portalExit` keyframe (`opacity 1→0, scale 1→0.92, blur 0→6px`), waits 400ms, then
navigates to `/chat/:id`. Navigation unmounts `Portal` and mounts `GlobalChat` fresh.

## Key enabling fact

Both composers are **already fully driven by `GlobalChatStore`**. `usePortalChat`
(`web/src/components/portal/usePortalChat.ts`) is a thin wrapper over `useGlobalChatStore`;
`GlobalChat`/`ChatView` read the same store. Model, selected tools, agent mode, and status
all live in that single store. No state needs to be lifted — only **one DOM instance of the
composer** needs to survive the route change so its draft text and focus are preserved and
its box can be animated from "centered" to "pinned bottom."

A single React node cannot move between two unmounting route trees, so the composer must be
rendered *above* both routes; each route tells it where to position itself.

## Approach

Approach **B — persistent composer** (chosen over View Transitions API and framer-motion).
A single, always-mounted composer lives in a layout route that wraps `/dashboard` and
`/chat`. Each route renders an empty anchor slot; the composer measures the active slot and
FLIP-animates between slot positions on navigation.

### User-facing behavior (decided)

- **Thread reveal:** thread content **just appears** (no fade/slide) once messages exist.
  Only the composer's position is animated.
- **Animation tech:** hand-rolled FLIP via the **Web Animations API** (`element.animate`).
  No new dependency (framer-motion is not installed).

## Architecture

### 1. Layout route

Wrap the two routes in a shared layout in `web/src/index.tsx`:

```
{ element: <ChatComposerLayout/>, children: [
    { path: "/dashboard",        element: <Portal/> },
    { path: "/chat/:thread_id?", element: <chat chrome + GlobalChat/> },
]}
```

`ChatComposerLayout` renders `<Outlet/>` plus one `<PersistentComposer/>` and provides the
slot-registration context. Moving *between* these routes keeps the layout (and composer)
mounted → draft text/focus preserved and position animatable. Navigating elsewhere
(`/editor`, `/settings`, …) unmounts the layout and the composer disappears, exactly as
today.

The existing per-route chrome (`AppHeader`, `PanelLeft`, `PanelBottom`) stays inside each
route element. Only the composer is lifted.

### 2. Slot registration context

A small context (or Zustand store) exposed by `ChatComposerLayout`:

```ts
interface ComposerSlotRegistry {
  registerSlot(el: HTMLElement | null): void; // null clears
  activeSlot: HTMLElement | null;             // current anchor
  setComposerHeight(px: number): void;        // composer → slot height sync
  composerHeight: number;
}
```

Only one slot is active at a time. If two slots are briefly mounted during a route
transition, last-registered wins; on unmount a slot clears itself only if it is the active
one.

### 3. `ComposerSlot`

An empty spacer each route renders where the composer should sit:

- **Portal:** centered (the current `.portal-input-wrapper` position, `max-width: 640`).
- **ChatView:** pinned to the bottom of the chat column (`max-width: 1000`, the current
  `ChatInputSection` position).

On mount it calls `registerSlot(el)`; on unmount it clears. It reserves vertical space equal
to `composerHeight` from the registry so thread content above it lays out correctly while
the real composer is `position: fixed` on top.

### 4. `PersistentComposer`

`position: fixed` overlay rendering `<ChatInputSection variant="media">` exactly once. It
reads model/tools/agentMode/status from `GlobalChatStore` (the superset of what both routes
passed). It:

- Measures `activeSlot.getBoundingClientRect()` and matches its own `top/left/width/height`.
- Observes its own content height via `ResizeObserver` and writes it to the registry
  (`setComposerHeight`) so slots reserve the right space.
- Re-measures on window resize and on `activeSlot` changes (panel open/close, etc.).
- Hides (e.g. `visibility: hidden` / not positioned) when `activeSlot` is `null`.

### 5. FLIP animation on slot change

When `activeSlot` changes:

1. Capture the composer's current rect (`first`).
2. Move it to the new slot's rect (`last`) by updating its style.
3. Compute the inverse delta (`first` − `last`) and apply it as a `transform` (and scale if
   width differs).
4. `element.animate([{ transform: invert }, { transform: 'none' }], { duration: 350,
   easing: '<existing easing>' })` to glide to the new position.

Use the existing motion easing/duration tokens where possible
(`web/src/components/ui_primitives/tokens.ts`, ~350ms `slow`).

### 6. Unified send handler

A shared hook (e.g. `usePersistentComposerSend`) or logic in `ChatComposerLayout` that
builds the `ChatOutgoingMessage` from store state — reusing `ChatView.handleSendMessage`'s
existing construction, including the `media_generation` branch
(`ChatView.tsx:184-212`) — then:

- If current route is `/dashboard`: `createNewThread()` → `switchThread()` → `sendMessage()`
  → `navigate('/chat/:id')`. **No fade-out hack.**
- If current route is `/chat`: `sendMessage()` to the current thread.

Because the composer stays mounted across that navigation, there is no flash; the thread
content appears above while the composer glides from center to bottom.

## Changes by file

- **`web/src/index.tsx`** — introduce `ChatComposerLayout` as a parent of `/dashboard` and
  `/chat/:thread_id`.
- **New `ChatComposerLayout.tsx`** — `<Outlet/>` + `<PersistentComposer/>` + slot registry
  context + unified send hook wiring.
- **New `PersistentComposer.tsx`** — fixed overlay, measurement, FLIP, store wiring.
- **New `ComposerSlot.tsx`** — registering spacer.
- **New `useComposerSlot` / registry** — context + hook.
- **`web/src/components/portal/Portal.tsx`** — remove its `<ChatInputSection>`, the
  `portalExit` fade-out and `isTransitioning`-on-send path; render a centered
  `<ComposerSlot/>`. (Keep the `setup`-state fade and other transitions — those are
  unrelated to send.)
- **`web/src/components/chat/containers/ChatView.tsx`** — remove its `<ChatInputSection>`;
  render a bottom `<ComposerSlot/>`. Move `handleSendMessage` construction into the shared
  send hook (or export it for reuse).

## Edge cases

- **Portal "setup" state** (no provider key configured): slot unregisters → composer hides;
  the existing setup flow shows. Behavior unchanged. The pending-message → setup → send path
  is preserved via the unified send hook.
- **Variable composer height** (textarea grows, attachments): overlay observes its own
  height and feeds the active slot so the spacer always matches.
- **Mobile / panel toggles:** positions are measured live, so FLIP follows the real layout;
  the existing `margin-left` sidebar transition still applies to the chat column.
- **Rapid double navigation:** last-registered slot wins; an in-flight animation is
  cancelled and restarted from the current rect.
- **No-JS / reduced motion:** respect `prefers-reduced-motion` — skip the FLIP animation and
  snap to the new slot position.

## Testing

- **Unit (Jest + RTL):**
  - `ComposerSlot` registers on mount and clears on unmount; only-active-clears guard.
  - Registry: last-registered slot becomes active; height propagation.
  - Unified send hook: on `/dashboard` creates thread + navigates; on `/chat` sends to
    current thread; `media_generation` branch passes through unchanged.
- **Component:** `ChatComposerLayout` renders exactly one composer across a simulated
  `/dashboard` → `/chat` navigation (composer node identity preserved); draft text persists
  across the navigation.
- **Animation:** assert `element.animate` is invoked with a non-zero initial transform on
  slot change, and skipped under `prefers-reduced-motion` (mock `matchMedia`).
- Existing `GlobalChat.test.tsx` and Portal tests updated for the new structure.

## Out of scope

- Standalone chat (`/standalone-chat`) and the agent-panel composer (`variant="simple"`)
  keep their own in-tree composers — no shared persistence there.
- No visual redesign of the composer itself; only its mount location and transition change.
