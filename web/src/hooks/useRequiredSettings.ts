import { useMemo } from "react";
import useMetadataStore from "../stores/MetadataStore";
import useRemoteSettingsStore from "../stores/RemoteSettingStore";

export const useRequiredSettings = (nodeType: string): string[] => {
  const metadata = useMetadataStore((state) => state.getMetadata(nodeType));
  const settings = useRemoteSettingsStore((state) => state.settings);
  const isLoading = useRemoteSettingsStore((state) => state.isLoading);

  return useMemo(() => {
    if (isLoading || !metadata) {
      return [];
    }

    const requiredSettings = metadata.required_settings;

    if (!requiredSettings || requiredSettings.length === 0) {
      return [];
    }

    const missingSettings = requiredSettings.filter((envVar) => {
      const setting = settings.find((s) => s.env_var === envVar);
      const value = setting?.value;
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
