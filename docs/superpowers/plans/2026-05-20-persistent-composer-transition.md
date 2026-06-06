# Persistent Composer Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep a single composer instance mounted across `/dashboard` → `/chat`, so it preserves the user's typed text and glides from the centered start-page position to the pinned-bottom chat position instead of unmounting and re-fading.

**Architecture:** A new layout route `ChatComposerLayout` wraps `/dashboard` and `/chat/:thread_id` and renders one `PersistentComposer` (a `position: fixed` overlay) above the route `<Outlet/>`. Each route renders an empty `ComposerSlot` that registers its DOM element and a per-route send handler with a shared context; the overlay measures the active slot and FLIP-animates (Web Animations API) between slot positions on navigation. State (model/tools/agent/status) already lives entirely in `GlobalChatStore`, so nothing is lifted — only the DOM instance.

**Tech Stack:** React 19, react-router-dom 7, Zustand (`GlobalChatStore`), Emotion, MUI v7, Jest + React Testing Library.

---

## File Structure

**New files (all under `web/src/components/chat/composer/`):**
- `composerSlotContext.tsx` — React context: active slot element, active send handler, composer height. Provider + `useComposerSlotContext` hook.
- `ComposerSlot.tsx` — empty spacer; registers its element + an `onSend` handler on mount, clears on unmount, reserves `composerHeight` of vertical space.
- `useFlipPosition.ts` — FLIP helper: animates an element from its previous rect to its current rect via `element.animate`, honoring `prefers-reduced-motion`.
- `PersistentComposer.tsx` — fixed overlay rendering one `ChatInputSection`, measuring the active slot, wiring `GlobalChatStore`, running FLIP.

**New file (`web/src/components/chat/containers/`):**
- `ChatComposerLayout.tsx` — `<Outlet/>` + `ComposerSlotProvider` + `PersistentComposer`.

**Modified files:**
- `web/src/index.tsx` — nest `/dashboard` and `/chat/:thread_id` under `ChatComposerLayout`.
- `web/src/components/portal/Portal.tsx` — remove its `ChatInputSection`, the `portalExit` send fade, and `isTransitioning`-on-send; render a centered `ComposerSlot`.
- `web/src/components/chat/containers/ChatView.tsx` — add `useExternalComposer` prop; when true, render `ComposerSlot` (wired to its existing `handleSendMessage`) instead of `ChatInputSection`. Other consumers (StandaloneChat, agent panel) keep the inline composer.
- `web/src/components/chat/containers/GlobalChat.tsx` — pass `useExternalComposer` to `ChatView`.

**Test files:**
- `web/src/components/chat/composer/__tests__/composerSlotContext.test.tsx`
- `web/src/components/chat/composer/__tests__/ComposerSlot.test.tsx`
- `web/src/components/chat/composer/__tests__/useFlipPosition.test.tsx`
- `web/src/components/chat/composer/__tests__/PersistentComposer.test.tsx`

Run web tests with: `cd web && npx jest <path>` (or `npm test`). Typecheck: `cd web && npm run typecheck`.

---

## Task 1: Composer slot context

**Files:**
- Create: `web/src/components/chat/composer/composerSlotContext.tsx`
- Test: `web/src/components/chat/composer/__tests__/composerSlotContext.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/components/chat/composer/__tests__/composerSlotContext.test.tsx
import React from "react";
import "@testing-library/jest-dom";
import { render, screen, act } from "@testing-library/react";
import {
  ComposerSlotProvider,
  useComposerSlotContext
} from "../composerSlotContext";

const noopSend = jest.fn();

function Probe() {
  const { activeSlot, registerSlot, unregisterSlot } =
    useComposerSlotContext();
  return (
    <div>
      <span data-testid="active">{activeSlot ? activeSlot.id : "none"}</span>
      <button
        onClick={() => {
          const el = document.createElement("div");
          el.id = "slot-a";
          registerSlot(el, noopSend);
          (window as any).__slotA = el;
        }}
      >
        register-a
      </button>
      <button onClick={() => unregisterSlot((window as any).__slotA)}>
        unregister-a
      </button>
    </div>
  );
}

describe("composerSlotContext", () => {
  it("tracks the active slot and clears only when the active element unregisters", () => {
    render(
      <ComposerSlotProvider>
        <Probe />
      </ComposerSlotProvider>
    );

    expect(screen.getByTestId("active")).toHaveTextContent("none");

    act(() => {
      screen.getByText("register-a").click();
    });
    expect(screen.getByTestId("active")).toHaveTextContent("slot-a");

    act(() => {
      screen.getByText("unregister-a").click();
    });
    expect(screen.getByTestId("active")).toHaveTextContent("none");
  });

  it("ignores unregister of a non-active element", () => {
    render(
      <ComposerSlotProvider>
        <Probe />
      </ComposerSlotProvider>
    );
    act(() => {
      screen.getByText("register-a").click();
    });
    act(() => {
      // unregister a different element
      const other = document.createElement("div");
      // call unregister with a stale element by swapping window ref
      const realA = (window as any).__slotA;
      (window as any).__slotA = other;
      screen.getByText("unregister-a").click();
      (window as any).__slotA = realA;
    });
    expect(screen.getByTestId("active")).toHaveTextContent("slot-a");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx jest src/components/chat/composer/__tests__/composerSlotContext.test.tsx`
Expected: FAIL — cannot resolve `../composerSlotContext`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// web/src/components/chat/composer/composerSlotContext.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState
} from "react";
import type { MessageContent } from "../../../stores/ApiTypes";
import type { MediaGenerationRequest } from "../types/media.types";

export type ComposerSendHandler = (
  content: MessageContent[],
  prompt: string,
  agentMode: boolean,
  mediaGeneration?: MediaGenerationRequest
) => void | Promise<void>;

interface ComposerSlotContextValue {
  activeSlot: HTMLElement | null;
  activeSend: ComposerSendHandler | null;
  composerHeight: number;
  registerSlot: (el: HTMLElement, send: ComposerSendHandler) => void;
  unregisterSlot: (el: HTMLElement) => void;
  setComposerHeight: (px: number) => void;
}

const ComposerSlotContext = createContext<ComposerSlotContextValue | null>(
  null
);

export const ComposerSlotProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const [activeSlot, setActiveSlot] = useState<HTMLElement | null>(null);
  const [composerHeight, setComposerHeight] = useState(0);
  // Keep the latest send handler in a ref so re-registering does not churn
  // identity for consumers that only read `activeSend`.
  const sendRef = useRef<ComposerSendHandler | null>(null);
  const [activeSend, setActiveSend] = useState<ComposerSendHandler | null>(
    null
  );

  const registerSlot = useCallback(
    (el: HTMLElement, send: ComposerSendHandler) => {
      sendRef.current = send;
      setActiveSlot(el);
      setActiveSend(() => send);
    },
    []
  );

  const unregisterSlot = useCallback((el: HTMLElement) => {
    setActiveSlot((current) => {
      if (current === el) {
        sendRef.current = null;
        setActiveSend(null);
        return null;
      }
      return current;
    });
  }, []);

  const value = useMemo<ComposerSlotContextValue>(
    () => ({
      activeSlot,
      activeSend,
      composerHeight,
      registerSlot,
      unregisterSlot,
      setComposerHeight
    }),
    [activeSlot, activeSend, composerHeight, registerSlot, unregisterSlot]
  );

  return (
    <ComposerSlotContext.Provider value={value}>
      {children}
    </ComposerSlotContext.Provider>
  );
};

export function useComposerSlotContext(): ComposerSlotContextValue {
  const ctx = useContext(ComposerSlotContext);
  if (!ctx) {
    throw new Error(
      "useComposerSlotContext must be used within a ComposerSlotProvider"
    );
  }
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx jest src/components/chat/composer/__tests__/composerSlotContext.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/chat/composer/composerSlotContext.tsx web/src/components/chat/composer/__tests__/composerSlotContext.test.tsx
git commit -m "feat(chat): add composer slot registration context"
```

---

## Task 2: ComposerSlot spacer

**Files:**
- Create: `web/src/components/chat/composer/ComposerSlot.tsx`
- Test: `web/src/components/chat/composer/__tests__/ComposerSlot.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/components/chat/composer/__tests__/ComposerSlot.test.tsx
import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import {
  ComposerSlotProvider,
  useComposerSlotContext
} from "../composerSlotContext";
import ComposerSlot from "../ComposerSlot";

const send = jest.fn();

function ActiveReadout() {
  const { activeSlot } = useComposerSlotContext();
  return (
    <span data-testid="active">{activeSlot ? "registered" : "none"}</span>
  );
}

describe("ComposerSlot", () => {
  it("registers on mount and clears on unmount", () => {
    const { unmount, rerender } = render(
      <ComposerSlotProvider>
        <ComposerSlot onSend={send} className="slot" />
        <ActiveReadout />
      </ComposerSlotProvider>
    );
    expect(screen.getByTestId("active")).toHaveTextContent("registered");

    rerender(
      <ComposerSlotProvider>
        <ActiveReadout />
      </ComposerSlotProvider>
    );
    // After removing the slot, the provider's active element should clear.
    expect(screen.getByTestId("active")).toHaveTextContent("none");
    unmount();
  });

  it("reserves vertical space equal to the composer height", () => {
    render(
      <ComposerSlotProvider>
        <ComposerSlot onSend={send} className="slot" />
      </ComposerSlotProvider>
    );
    const slot = document.querySelector("[data-composer-slot]") as HTMLElement;
    expect(slot).toBeTruthy();
    // composerHeight defaults to 0 → min-height 0 is acceptable; presence check.
    expect(slot.getAttribute("data-composer-slot")).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx jest src/components/chat/composer/__tests__/ComposerSlot.test.tsx`
Expected: FAIL — cannot resolve `../ComposerSlot`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// web/src/components/chat/composer/ComposerSlot.tsx
import React, { useLayoutEffect, useRef } from "react";
import {
  useComposerSlotContext,
  type ComposerSendHandler
} from "./composerSlotContext";

interface ComposerSlotProps {
  /** Per-route send handler invoked by the persistent composer. */
  onSend: ComposerSendHandler;
  className?: string;
}

/**
 * Empty spacer that marks where the persistent composer should be anchored on
 * the current route. Registers its DOM element + send handler with the slot
 * context and reserves vertical space equal to the live composer height so
 * content above it lays out correctly while the real composer is rendered as a
 * fixed overlay on top.
 */
const ComposerSlot: React.FC<ComposerSlotProps> = ({ onSend, className }) => {
  const { registerSlot, unregisterSlot, composerHeight } =
    useComposerSlotContext();
  const ref = useRef<HTMLDivElement | null>(null);
  // Keep the latest handler without forcing re-registration each render.
  const sendRef = useRef<ComposerSendHandler>(onSend);
  sendRef.current = onSend;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    registerSlot(el, (...args) => sendRef.current(...args));
    return () => {
      unregisterSlot(el);
    };
  }, [registerSlot, unregisterSlot]);

  return (
    <div
      ref={ref}
      className={className}
      data-composer-slot=""
      style={{ height: composerHeight || undefined, flexShrink: 0 }}
    />
  );
};

export default ComposerSlot;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx jest src/components/chat/composer/__tests__/ComposerSlot.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/chat/composer/ComposerSlot.tsx web/src/components/chat/composer/__tests__/ComposerSlot.test.tsx
git commit -m "feat(chat): add ComposerSlot anchor spacer"
```

---

## Task 3: FLIP position hook

**Files:**
- Create: `web/src/components/chat/composer/useFlipPosition.ts`
- Test: `web/src/components/chat/composer/__tests__/useFlipPosition.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/components/chat/composer/__tests__/useFlipPosition.test.tsx
import React, { useRef } from "react";
import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import { useFlipPosition } from "../useFlipPosition";

// jsdom returns a zeroed DOMRect; we stub getBoundingClientRect per element.
function makeRect(x: number, y: number, w = 100, h = 40): DOMRect {
  return {
    x,
    y,
    width: w,
    height: h,
    top: y,
    left: x,
    right: x + w,
    bottom: y + h,
    toJSON: () => ({})
  } as DOMRect;
}

function Harness({ trigger }: { trigger: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useFlipPosition(ref, [trigger]);
  return <div ref={ref} data-testid="box" />;
}

describe("useFlipPosition", () => {
  let animateSpy: jest.SpyInstance;
  let matchMediaMock: jest.Mock;

  beforeEach(() => {
    animateSpy = jest
      .spyOn(Element.prototype, "animate")
      .mockReturnValue({} as Animation);
    matchMediaMock = jest.fn().mockReturnValue({ matches: false });
    // @ts-expect-error test stub
    window.matchMedia = matchMediaMock;
  });

  afterEach(() => {
    animateSpy.mockRestore();
  });

  it("does not animate on first render (no previous rect)", () => {
    const rects = [makeRect(0, 500), makeRect(0, 0)];
    let call = 0;
    jest
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(() => rects[Math.min(call++, rects.length - 1)]);

    render(<Harness trigger={1} />);
    expect(animateSpy).not.toHaveBeenCalled();
  });

  it("animates from the previous rect to the current rect on change", () => {
    const rects = [makeRect(0, 500), makeRect(0, 500), makeRect(0, 0)];
    let call = 0;
    jest
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(() => rects[Math.min(call++, rects.length - 1)]);

    const { rerender } = render(<Harness trigger={1} />);
    rerender(<Harness trigger={2} />);

    expect(animateSpy).toHaveBeenCalledTimes(1);
    const keyframes = animateSpy.mock.calls[0][0] as Keyframe[];
    expect(String(keyframes[0].transform)).toContain("translate");
  });

  it("skips animation when prefers-reduced-motion is set", () => {
    matchMediaMock.mockReturnValue({ matches: true });
    const rects = [makeRect(0, 500), makeRect(0, 500), makeRect(0, 0)];
    let call = 0;
    jest
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(() => rects[Math.min(call++, rects.length - 1)]);

    const { rerender } = render(<Harness trigger={1} />);
    rerender(<Harness trigger={2} />);
    expect(animateSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx jest src/components/chat/composer/__tests__/useFlipPosition.test.tsx`
Expected: FAIL — cannot resolve `../useFlipPosition`.

- [ ] **Step 3: Write minimal implementation**

```ts
// web/src/components/chat/composer/useFlipPosition.ts
import { useLayoutEffect, useRef, type RefObject } from "react";

const FLIP_DURATION_MS = 350;
const FLIP_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * FLIP animation: after every dependency change, compares the element's
 * previous bounding rect with its current one and animates the delta away via
 * the Web Animations API. The element must already have moved to its final
 * layout position (set by the caller) before this effect runs.
 */
export function useFlipPosition(
  ref: RefObject<HTMLElement | null>,
  deps: React.DependencyList
): void {
  const prevRect = useRef<DOMRect | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const last = el.getBoundingClientRect();
    const first = prevRect.current;
    prevRect.current = last;

    if (!first) return;
    if (prefersReducedMotion()) return;

    const dx = first.left - last.left;
    const dy = first.top - last.top;
    const sx = last.width === 0 ? 1 : first.width / last.width;
    const sy = last.height === 0 ? 1 : first.height / last.height;

    if (dx === 0 && dy === 0 && sx === 1 && sy === 1) return;

    el.animate(
      [
        {
          transformOrigin: "top left",
          transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`
        },
        { transformOrigin: "top left", transform: "none" }
      ],
      { duration: FLIP_DURATION_MS, easing: FLIP_EASING, fill: "both" }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx jest src/components/chat/composer/__tests__/useFlipPosition.test.tsx`
Expected: PASS (all three).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/chat/composer/useFlipPosition.ts web/src/components/chat/composer/__tests__/useFlipPosition.test.tsx
git commit -m "feat(chat): add FLIP position hook for composer transition"
```

---

## Task 4: PersistentComposer overlay

**Files:**
- Create: `web/src/components/chat/composer/PersistentComposer.tsx`
- Test: `web/src/components/chat/composer/__tests__/PersistentComposer.test.tsx`

> **jsdom note:** `getBoundingClientRect` returns zeros and `ResizeObserver` is
> not implemented in jsdom. The test stubs `ResizeObserver` and asserts the
> observable contract: a single composer renders, it is hidden when no slot is
> active, and the active send handler is invoked on submit. Pixel-accurate
> positioning is verified manually (Task 9 verification).

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/components/chat/composer/__tests__/PersistentComposer.test.tsx
import React from "react";
import "@testing-library/jest-dom";
import { render, screen, act } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import {
  ComposerSlotProvider,
  useComposerSlotContext
} from "../composerSlotContext";
import PersistentComposer from "../PersistentComposer";

// Stub ResizeObserver (absent in jsdom).
beforeAll(() => {
  // @ts-expect-error test stub
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

// Mock the heavy composer so the test stays focused on PersistentComposer.
const sendSpy = jest.fn();
jest.mock("../../containers/ChatInputSection", () => ({
  __esModule: true,
  default: ({ onSendMessage }: any) => (
    <button
      data-testid="composer"
      onClick={() => onSendMessage([{ type: "text", text: "hi" }], "hi", false)}
    >
      composer
    </button>
  )
}));

// Mock the store so PersistentComposer can read state.
jest.mock("../../../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: (selector: any) =>
    selector({
      status: "connected",
      selectedModel: { type: "language_model", provider: "openai", id: "x" },
      selectedTools: [],
      agentMode: false
    })
}));

function RegisterButton() {
  const { registerSlot } = useComposerSlotContext();
  return (
    <button
      onClick={() => {
        const el = document.createElement("div");
        el.id = "slot";
        document.body.appendChild(el);
        registerSlot(el, sendSpy);
      }}
    >
      register
    </button>
  );
}

function renderTree() {
  return render(
    <ThemeProvider theme={mockTheme}>
      <ComposerSlotProvider>
        <RegisterButton />
        <PersistentComposer />
      </ComposerSlotProvider>
    </ThemeProvider>
  );
}

describe("PersistentComposer", () => {
  it("renders exactly one composer", () => {
    renderTree();
    expect(screen.getAllByTestId("composer")).toHaveLength(1);
  });

  it("is hidden until a slot is active, then visible", () => {
    renderTree();
    const root = document.querySelector(
      "[data-persistent-composer]"
    ) as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.style.visibility).toBe("hidden");

    act(() => {
      screen.getByText("register").click();
    });
    expect(root.style.visibility).toBe("visible");
  });

  it("routes submit through the active slot's send handler", () => {
    renderTree();
    act(() => {
      screen.getByText("register").click();
    });
    act(() => {
      screen.getByTestId("composer").click();
    });
    expect(sendSpy).toHaveBeenCalledWith(
      [{ type: "text", text: "hi" }],
      "hi",
      false
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx jest src/components/chat/composer/__tests__/PersistentComposer.test.tsx`
Expected: FAIL — cannot resolve `../PersistentComposer`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// web/src/components/chat/composer/PersistentComposer.tsx
import React, {
  useCallback,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import ChatInputSection from "../containers/ChatInputSection";
import { useComposerSlotContext } from "./composerSlotContext";
import { useFlipPosition } from "./useFlipPosition";

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const HIDDEN_BOX: Box = { top: 0, left: 0, width: 0, height: 0 };

/**
 * Single composer instance shared across the routes nested under
 * ChatComposerLayout. Rendered as a fixed overlay positioned over the active
 * ComposerSlot; FLIP-animates between slots when the active slot changes
 * (i.e. on navigation between the start page and the chat view).
 */
const PersistentComposer: React.FC = () => {
  const { activeSlot, activeSend, setComposerHeight } =
    useComposerSlotContext();
  const status = useGlobalChatStore((s) => s.status);
  const selectedModel = useGlobalChatStore((s) => s.selectedModel);
  const selectedTools = useGlobalChatStore((s) => s.selectedTools);
  const agentMode = useGlobalChatStore((s) => s.agentMode);
  const setSelectedModel = useGlobalChatStore((s) => s.setSelectedModel);
  const setSelectedTools = useGlobalChatStore((s) => s.setSelectedTools);
  const setAgentMode = useGlobalChatStore((s) => s.setAgentMode);
  const stopGeneration = useGlobalChatStore((s) => s.stopGeneration);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<Box>(HIDDEN_BOX);

  // Measure the active slot and mirror its rect. Re-measures on slot change
  // and on window resize.
  const measure = useCallback(() => {
    if (!activeSlot) {
      setBox(HIDDEN_BOX);
      return;
    }
    const r = activeSlot.getBoundingClientRect();
    setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [activeSlot]);

  useLayoutEffect(() => {
    measure();
    if (!activeSlot) return;
    window.addEventListener("resize", measure);
    const ro = new ResizeObserver(measure);
    ro.observe(activeSlot);
    return () => {
      window.removeEventListener("resize", measure);
      ro.disconnect();
    };
  }, [activeSlot, measure]);

  // Report the composer's own height back to the active slot so it can reserve
  // matching space.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setComposerHeight(el.offsetHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [setComposerHeight]);

  // FLIP the overlay whenever its target box changes.
  useFlipPosition(rootRef, [box.top, box.left, box.width]);

  const visible = !!activeSlot;
  const handleSend = activeSend ?? undefined;

  return (
    <div
      ref={rootRef}
      data-persistent-composer=""
      style={{
        position: "fixed",
        top: box.top,
        left: box.left,
        width: box.width || undefined,
        height: box.height || undefined,
        visibility: visible ? "visible" : "hidden",
        pointerEvents: visible ? "auto" : "none",
        zIndex: 1200
      }}
    >
      {handleSend && (
        <ChatInputSection
          status={status === "stopping" ? "loading" : status}
          onSendMessage={handleSend}
          onStop={stopGeneration}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          selectedTools={selectedTools}
          onToolsChange={setSelectedTools}
          agentMode={agentMode}
          onAgentModeToggle={setAgentMode}
        />
      )}
    </div>
  );
};

export default PersistentComposer;
```

> **Note on `status`:** `GlobalChatStore`'s `ChatStatus` includes `"stopping"`,
> which `ChatInputSection` does not accept; the ternary maps it to `"loading"`,
> matching how `Portal` already does this (`Portal.tsx:463`). If the store's
> status union differs, narrow it the same way `ChatView` receives status.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx jest src/components/chat/composer/__tests__/PersistentComposer.test.tsx`
Expected: PASS (all three).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/chat/composer/PersistentComposer.tsx web/src/components/chat/composer/__tests__/PersistentComposer.test.tsx
git commit -m "feat(chat): add PersistentComposer overlay"
```

---

## Task 5: ChatComposerLayout

**Files:**
- Create: `web/src/components/chat/containers/ChatComposerLayout.tsx`

> No new unit test: this is thin composition (`<Outlet/>` + provider + overlay).
> It is exercised by the route integration and manual verification (Task 9).

- [ ] **Step 1: Write the implementation**

```tsx
// web/src/components/chat/containers/ChatComposerLayout.tsx
import React from "react";
import { Outlet } from "react-router-dom";
import { ComposerSlotProvider } from "../composer/composerSlotContext";
import PersistentComposer from "../composer/PersistentComposer";

/**
 * Layout route wrapping the start page (/dashboard) and the chat view
 * (/chat/:thread_id). Keeps a single composer instance mounted across
 * navigation between the two so the composer's draft text and focus survive and
 * its position can be animated (FLIP) from the centered start-page slot to the
 * pinned-bottom chat slot.
 */
const ChatComposerLayout: React.FC = () => {
  return (
    <ComposerSlotProvider>
      <Outlet />
      <PersistentComposer />
    </ComposerSlotProvider>
  );
};

export default ChatComposerLayout;
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npm run typecheck`
Expected: PASS (no errors introduced).

- [ ] **Step 3: Commit**

```bash
git add web/src/components/chat/containers/ChatComposerLayout.tsx
git commit -m "feat(chat): add ChatComposerLayout wrapping dashboard and chat"
```

---

## Task 6: Render external composer slot in ChatView

**Files:**
- Modify: `web/src/components/chat/containers/ChatView.tsx`

Currently `ChatView` always renders `<ChatInputSection>` after the thread
container. Add a `useExternalComposer` prop: when true, render a bottom
`ComposerSlot` wired to the existing `handleSendMessage` instead of the inline
composer. Default false so StandaloneChat and the agent panel are unaffected.

- [ ] **Step 1: Add the prop to the type**

In the `ChatViewProps` type (near `composerVariant?`/`composerToolbar?`, around
line 133-138), add:

```tsx
  /**
   * When true, ChatView does not render its own composer. Instead it renders a
   * bottom ComposerSlot wired to its send handler, and the shared
   * PersistentComposer (from ChatComposerLayout) is positioned over it. Used by
   * GlobalChat so the composer persists across /dashboard → /chat.
   */
  useExternalComposer?: boolean;
```

- [ ] **Step 2: Destructure the prop**

In the component parameter destructuring (around line 173-174, after
`composerToolbar`), add `useExternalComposer = false,`.

- [ ] **Step 3: Add the import**

At the top of the file with the other composer imports, add:

```tsx
import ComposerSlot from "../composer/ComposerSlot";
```

- [ ] **Step 4: Conditionally render slot vs composer**

Find the always-rendered `<ChatInputSection ... />` block (after the
`chat-thread-container`, around lines 248-271 per the current file) and wrap it:

```tsx
{useExternalComposer ? (
  <ComposerSlot
    className="chat-input-section"
    onSend={handleSendMessage}
  />
) : (
  <ChatInputSection
    status={status}
    onSendMessage={handleSendMessage}
    /* ...keep ALL existing props exactly as they were... */
  />
)}
```

Keep every prop currently passed to `ChatInputSection` inside the `else`
branch unchanged. Only the wrapping ternary and the `ComposerSlot` branch are
new.

- [ ] **Step 5: Typecheck**

Run: `cd web && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Run existing ChatView/GlobalChat tests**

Run: `cd web && npx jest src/__tests__/components/chat`
Expected: PASS (no regression; default `useExternalComposer=false` preserves old behavior).

- [ ] **Step 7: Commit**

```bash
git add web/src/components/chat/containers/ChatView.tsx
git commit -m "feat(chat): let ChatView delegate composer to an external slot"
```

---

## Task 7: Enable external composer in GlobalChat

**Files:**
- Modify: `web/src/components/chat/containers/GlobalChat.tsx:622-648`

- [ ] **Step 1: Pass the flag**

In the `<ChatView ... />` usage (around line 622), add the prop:

```tsx
            <ChatView
              status={getChatViewStatus()}
              /* ...all existing props... */
              noMessagesPlaceholder={welcomePlaceholder}
              useExternalComposer
            />
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Run GlobalChat tests**

Run: `cd web && npx jest src/__tests__/components/chat/containers/GlobalChat.test.tsx`
Expected: PASS. If the test asserts on the inline composer's presence, update it
to expect a `[data-composer-slot]` element instead — the composer now lives in
the (un-rendered-in-this-unit) layout. Wrap the render in `ComposerSlotProvider`
if the slot's `useLayoutEffect` throws for a missing provider.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/chat/containers/GlobalChat.tsx web/src/__tests__/components/chat/containers/GlobalChat.test.tsx
git commit -m "feat(chat): use external persistent composer in GlobalChat"
```

---

## Task 8: Portal renders a centered slot, drops the send fade

**Files:**
- Modify: `web/src/components/portal/Portal.tsx`

- [ ] **Step 1: Replace the composer with a slot**

In the IDLE render (around lines 461-471), replace the `<ChatInputSection .../>`
inside `.portal-input-wrapper` with:

```tsx
        <div className="portal-input-wrapper">
          <ComposerSlot className="chat-input-section" onSend={handleSendMessage} />
          {debouncedQuery.length >= 2 && !isTransitioning && (
            <PortalSearchResults
              /* ...unchanged... */
            />
          )}
        </div>
```

Update the import at the top: remove
`import ChatInputSection from "../chat/containers/ChatInputSection";` and add
`import ComposerSlot from "../chat/composer/ComposerSlot";`.

- [ ] **Step 2: Remove the send fade-out from `handleSendMessage`**

Replace the body of `handleSendMessage` (lines 325-346) so it no longer triggers
the whole-page `portalExit` fade on a normal send (the persistent composer now
provides continuity). Keep the no-provider → setup branch:

```tsx
  const handleSendMessage = useCallback(
    async (content: MessageContent[], prompt: string, _agentMode: boolean) => {
      setDebouncedQuery("");

      if (!hasConfiguredProvider) {
        setPendingMessage(prompt);
        setIsTransitioning(true);
        setTimeout(() => {
          setIsTransitioning(false);
          setPortalState("setup");
        }, 400);
        return;
      }

      await sendAndNavigate(content, prompt);
    },
    [hasConfiguredProvider, sendAndNavigate]
  );
```

- [ ] **Step 3: Remove the navigation delay in `sendAndNavigate`**

In `sendAndNavigate` (lines 303-322), drop the `setTimeout(..., 100)` wrapper so
navigation happens immediately after send (the composer no longer needs the page
to finish fading):

```tsx
        await sendMessage(message);
        navigate(`/chat/${threadId}`);
```

- [ ] **Step 4: Typecheck + lint**

Run: `cd web && npm run typecheck && npm run lint`
Expected: PASS. Remove any now-unused symbols flagged by lint (e.g. the
`portalExit` keyframe and the `&.portal-transitioning .portal-center` rule are
still used by the `setup` path and recents transitions — keep them; only remove
imports/vars that lint reports as unused).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/portal/Portal.tsx
git commit -m "feat(portal): use persistent composer slot, drop send fade-out"
```

---

## Task 9: Wire the layout route

**Files:**
- Modify: `web/src/index.tsx:259-332`

- [ ] **Step 1: Import the layout**

With the other lazy/eager route imports near the top of `index.tsx`, add:

```tsx
import ChatComposerLayout from "./components/chat/containers/ChatComposerLayout";
```

- [ ] **Step 2: Nest the two routes under the layout**

Replace the two separate top-level route objects for `/dashboard` (lines
263-270) and `/chat/:thread_id?` (lines 300-332) with a single layout route
whose children are those two routes. Keep each child's existing `element`
(including `ProtectedRoute` and chrome) exactly as-is:

```tsx
    {
      element: <ChatComposerLayout />,
      children: [
        {
          path: "/dashboard",
          element: (
            <ProtectedRoute>
              <Portal />
            </ProtectedRoute>
          )
        },
        {
          path: "/chat/:thread_id?",
          element: (
            <ProtectedRoute>
              <div
                className="page-enter"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  width: "100%",
                  height: "100%"
                }}
              >
                <SkipLinks />
                <AppHeader />
                <div
                  id="main-content"
                  style={{ display: "flex", width: "100%", height: "100%" }}
                >
                  <PanelLeft />
                  <GlobalChat />
                  <PanelBottom />
                </div>
              </div>
            </ProtectedRoute>
          )
        }
      ]
    },
```

> The `/` and `/welcome` route objects (lines 258-262, 271-276) stay where they
> are. Only `/dashboard` and `/chat/:thread_id?` move under the layout.

- [ ] **Step 3: Typecheck + lint**

Run: `cd web && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Manual verification (the real test of this feature)**

```bash
cd web && npm start
```

Then in the browser at `http://localhost:3000`:
1. Go to `/dashboard`. Confirm the composer appears centered.
2. Type a multi-word prompt. **Before submitting**, confirm the text is there.
3. Submit. **Expected:** the composer does NOT disappear/re-fade; it glides from
   center to the bottom of the chat view while the thread appears above it. The
   draft text field clears as part of the normal send (not via remount).
4. Resize the window mid-session; confirm the composer stays anchored.
5. Toggle `prefers-reduced-motion` (OS setting / devtools rendering emulation);
   confirm the composer snaps to the new position with no glide.
6. Navigate to `/editor` and back; confirm the composer unmounts/remounts
   normally (no stuck overlay).

- [ ] **Step 5: Commit**

```bash
git add web/src/index.tsx
git commit -m "feat(routing): nest dashboard and chat under ChatComposerLayout"
```

---

## Task 10: Full verification

- [ ] **Step 1: Run the full web check**

Run: `cd web && npm run typecheck && npm run lint && npm test`
Expected: PASS. Fix any failures before proceeding.

- [ ] **Step 2: Confirm no orphaned composer usages**

Run: `cd web && grep -rn "ChatInputSection" src/components/portal src/components/chat/containers/GlobalChat.tsx`
Expected: `Portal.tsx` no longer imports/renders `ChatInputSection`; `GlobalChat`
delegates via `ChatView` (no direct `ChatInputSection`). `ChatView.tsx` still
imports it for the non-external branch — that is correct.

- [ ] **Step 3: Final commit (if any fixups)**

```bash
git add -A
git commit -m "test: verification fixups for persistent composer"
```

---

## Self-Review Notes (already applied)

- **Spec coverage:** layout route (Task 5/9), ComposerSlot (Task 2), PersistentComposer + measurement + height sync (Task 4), FLIP via WAAPI + reduced-motion (Task 3), unified-but-per-route send via registered handler (Tasks 2/6/8), thread "just appears" (no fade added — Task 6 leaves thread rendering untouched), Portal fade removal (Task 8), out-of-scope StandaloneChat/agent panel preserved via `useExternalComposer` default false (Task 6).
- **Type consistency:** `ComposerSendHandler` defined in Task 1 is the signature used by `ComposerSlot.onSend` (Task 2), `ChatView`/`Portal` `handleSendMessage` (Tasks 6/8), and `PersistentComposer`'s `activeSend` (Task 4). `registerSlot(el, send)` / `unregisterSlot(el)` consistent across Tasks 1, 2, 4.
- **Decisions honored:** thread reveal "just appear" (no fade code added); FLIP via `element.animate` (no framer-motion dependency).
