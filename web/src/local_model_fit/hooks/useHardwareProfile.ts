/**
 * Local Model Fit — useHardwareProfile hook
 *
 * Provides the active hardware profile, a setter, and an async
 * `detect()` function that runs browser-side hardware detection.
 */

import { useCallback } from "react";
import { useLocalModelFitStore } from "../store/localModelFitStore";
import { detectHardwareProfile } from "../hardwareProfileDetection";
import type { HardwareProfile } from "../types";

export interface UseHardwareProfileResult {
  /** The currently active hardware profile. */
  profile: HardwareProfile;
  /** Replace the profile with a preset or custom one. */
  setProfile: (profile: HardwareProfile) => void;
  /** Run browser-side detection and update the store. */
  detect: () => Promise<HardwareProfile>;
}

export const useHardwareProfile = (): UseHardwareProfileResult => {
  const profile = useLocalModelFitStore((s) => s.hardwareProfile);
  const setProfile = useLocalModelFitStore((s) => s.setHardwareProfile);

  const detect = useCallback(async () => {
    const detected = await detectHardwareProfile();
    setProfile(detected);
    return detected;
  }, [setProfile]);

  return { profile, setProfile, detect };
};
