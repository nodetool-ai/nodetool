import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Navigate to the in-app Package Manager — the unified install surface for
 * runtimes, node packs, and models. It lives on its own `/packages` route
 * (reachable from the logo menu) and replaced the standalone Electron window.
 */
export function useOpenPackageManager(): () => void {
  const navigate = useNavigate();
  return useCallback(() => navigate("/packages"), [navigate]);
}
