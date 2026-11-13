import { useMemo } from "react";
import useMetadataStore from "../stores/MetadataStore";
import useRemoteSettingsStore from "../stores/RemoteSettingStore";
import type { SettingWithValue } from "../stores/RemoteSettingStore";
import { isString } from "../utils/typePredicates";

/** The settings in `required` that have no value in `settings`. */
export const findMissingSettings = (
  required: readonly string[],
  settings: readonly SettingWithValue[]
): string[] =>
  required.filter((envVar) => {
    const setting = settings.find((s) => s.env_var === envVar);
    const value = setting?.value;
    return (
      !setting ||
      value === null ||
      value === undefined ||
      (isString(value) && value.trim() === "")
    );
  });

export const useRequiredSettings = (nodeType: string): string[] => {
  const metadata = useMetadataStore((state) => state.getMetadata(nodeType));
  const settings = useRemoteSettingsStore((state) => state.settings);
  const isLoading = useRemoteSettingsStore((state) => state.isLoading);

  return useMemo(() => {
    if (isLoading || !metadata?.required_settings?.length) {
      return [];
    }
    return findMissingSettings(metadata.required_settings, settings);
  }, [metadata, settings, isLoading]);
};
