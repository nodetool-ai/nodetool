# ⚡ Bolt: Throttled Chat Scroll Handler

## 💡 What
Refactored the `handleScroll` function in `web/src/components/chat/thread/ChatThreadView.tsx` to use `requestAnimationFrame` for throttling. This ensures that expensive layout calculations (reading `scrollTop`, `scrollHeight`, `clientHeight`) and state updates occur at most once per animation frame (typically 60fps).

## 🎯 Why
The original implementation executed the scroll handler synchronously on every `scroll` event. High-frequency scroll events (especially on precision trackpads) can fire hundreds of times per second. Accessing layout properties like `scrollHeight` synchronously forces the browser to recalculate layout (reflow), causing "layout thrashing" and jank, particularly when the chat thread is long.

## 📊 Impact
- **Reduced Main Thread Work:** Prevents excessive JavaScript execution and layout recalculations during scrolling.
- **Smoother Scrolling:** Ensures consistent 60fps scrolling performance by decoupling scroll logic from the event rate.
- **Better Responsiveness:** Frees up the main thread for other interactions (like typing or UI updates) during scrolling.

## 🔬 Measurement
The improvement can be verified by profiling the "Scroll" interaction in Chrome DevTools Performance tab.
- **Before:** Dense blocks of "Layout" and "Function Call" markers on every scroll event.
- **After:** Sparse, regular "Animation Frame Fired" blocks containing the layout logic, spaced ~16ms apart.

## 🧪 Testing
- **Unit Tests:** Ran `make test-web`. All 294 tests passed, confirming no regressions in chat or other components.
- **Type Check:** Ran `cd web && npm run typecheck`. Passed.
- **Lint:** Ran `cd web && npm run lint`. Passed.
- **Manual Verification:** Verified that the application starts and renders without crashing (backend was offline, so verification was limited to ensuring no runtime errors in component mounting logic).
