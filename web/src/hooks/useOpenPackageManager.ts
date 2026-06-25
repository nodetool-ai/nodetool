import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Settings tab index of the Package Manager (see SettingsMenu's tab order).
 * The Package Manager is the unified install surface for runtimes, node packs,
 * and models — it replaced the standalone Electron window.
 */
const PACKAGE_MANAGER_TAB = 4;

/** Navigate to the in-app Package Manager (Settings → Package Manager). */
export function useOpenPackageManager(): () => void {
  const navigate = useNavigate();
  return useCallback(
    () => navigate(`/settings?tab=${PACKAGE_MANAGER_TAB}`),
    [navigate]
  );
}
