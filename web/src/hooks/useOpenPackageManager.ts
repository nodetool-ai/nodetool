import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

/** Route of the in-app Package Manager. */
const PACKAGE_MANAGER_PATH = "/packages";

/**
 * Navigate to the in-app Package Manager — the unified install surface for
 * runtimes, node packs, and models. It lives on its own `/packages` route
 * (reachable from the logo menu) and replaced the standalone Electron window.
 */
export function useOpenPackageManager(): () => void {
  const navigate = useNavigate();
  return useCallback(() => navigate(PACKAGE_MANAGER_PATH), [navigate]);
}

/**
 * Open the Package Manager in a new browser tab, so the page the user came
 * from (the Model Manager, a workflow) stays open behind it.
 */
export function useOpenPackageManagerInNewTab(): () => void {
  return useCallback(() => {
    window.open(PACKAGE_MANAGER_PATH, "_blank", "noopener,noreferrer");
  }, []);
}
