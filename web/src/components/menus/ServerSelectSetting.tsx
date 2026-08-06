import React, { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { SelectField, Text, type SelectOption } from "../ui_primitives";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";

export interface ServerSelectSettingProps {
  /** Registry env var key (e.g. NODETOOL_AGENT_EXECUTION_MODE). */
  envVar: string;
  label: string;
  description: React.ReactNode;
  options: readonly SelectOption[];
  defaultValue: string;
  id?: string;
}

/**
 * A select backed by a server-side registry setting (read/written via tRPC
 * `settings.list`/`settings.update`), the enum counterpart to
 * {@link ServerNumberSetting}. These live on the server because the runner
 * reads them via `getSetting`, not in the local SettingsStore.
 */
export const ServerSelectSetting = React.memo(function ServerSelectSetting({
  envVar,
  label,
  description,
  options,
  defaultValue,
  id
}: ServerSelectSettingProps) {
  const fetchSettings = useRemoteSettingsStore((s) => s.fetchSettings);
  const updateSettings = useRemoteSettingsStore((s) => s.updateSettings);
  // Shared ["settings"] cache: dedupes with the API & Keys tab's own query.
  useQuery({ queryKey: ["settings"], queryFn: fetchSettings });

  const stored = useRemoteSettingsStore(
    (s) => s.settings.find((x) => x.env_var === envVar)?.value
  );
  const value =
    stored != null && stored !== "" ? String(stored) : defaultValue;

  const handleChange = useCallback(
    (next: string) => {
      if (next === value) return;
      void updateSettings({ [envVar]: next });
    },
    [value, updateSettings, envVar]
  );

  return (
    <>
      <SelectField
        id={id}
        label={label}
        value={value}
        onChange={handleChange}
        options={options}
        variant="standard"
        size="small"
      />
      <Text className="description">{description}</Text>
    </>
  );
});

export default ServerSelectSetting;
