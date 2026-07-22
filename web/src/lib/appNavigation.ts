/**
 * Router-independent navigation for components that render outside the
 * `<RouterProvider>` tree.
 *
 * Global dialogs (e.g. the provider onboarding dialog) are mounted as siblings
 * of `<RouterProvider>`, so they cannot call the `useNavigate` hook — it throws
 * "useNavigate() may be used only in the context of a <Router> component". The
 * app router is a singleton created once at startup; index.tsx registers it
 * here, and callers navigate through the singleton's `navigate` method, which
 * works from any context. When no router is registered (preview harnesses,
 * tests) navigation falls back to a plain location change.
 */
type AppRouter = { navigate: (to: string) => void | Promise<void> };

let appRouter: AppRouter | null = null;

export const registerAppRouter = (router: AppRouter): void => {
  appRouter = router;
};

export const navigateTo = (to: string): void => {
  if (appRouter) {
    void appRouter.navigate(to);
    return;
  }
  // No router registered (preview harness, or a node-environment test where
  // `window` is undefined). Fall back to a location change only in the DOM.
  if (typeof window !== "undefined") {
    window.location.assign(to);
  }
};
