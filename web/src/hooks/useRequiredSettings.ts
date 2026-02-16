import { useMemo } from "react";
import useMetadataStore from "../stores/MetadataStore";
import useRemoteSettingsStore from "../stores/RemoteSettingStore";

/**
 * Hook to check if a node has missing required settings
 * @param nodeType - The fully qualified type of the node (e.g., "openai.ChatCompletion")
 * @returns Array of missing setting names, or empty array if all settings are configured
 */
export const useRequiredSettings = (nodeType: string): string[] => {
  const metadata = useMetadataStore((state) => state.getMetadata(nodeType));
  const settings = useRemoteSettingsStore((state) => state.settings);
  const isLoading = useRemoteSettingsStore((state) => state.isLoading);

  return useMemo(() => {
    if (isLoading || !metadata) {
      return []; // Don't show validation while loading or if no metadata
    }

    const requiredSettings = metadata.required_settings;
    
    if (!requiredSettings || requiredSettings.length === 0) {
      return []; // No required settings for this node
    }

    // Check which required settings are missing or empty
    const missingSettings = requiredSettings.filter((envVar) => {
      const setting = settings.find((s) => s.env_var === envVar);
      const value = setting?.value;
      // Check if value is missing, null, undefined, or empty string
      return (
        !setting ||
        value === null ||
        value === undefined ||
        (typeof value === "string" && value.trim() === "")
      );
    });

    return missingSettings;
  }, [metadata, settings, isLoading]);
};
