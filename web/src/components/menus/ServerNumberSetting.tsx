import React, { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TextInput, Text } from "../ui_primitives";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";

export interface ServerNumberSettingProps {
  /** Registry env var key (e.g. MAX_CONCURRENT_RUNS_PER_WORKFLOW). */
  envVar: string;
  label: string;
  description: React.ReactNode;
  defaultValue: number;
  min?: number;
  max?: number;
  id?: string;
}

/**
 * A numeric input backed by a server-side registry setting (read/written via
 * tRPC `settings.list`/`settings.update`). Unlike the editor preferences in the
 * General tab — which live in the local SettingsStore — these are persisted on
 * the server because the runner reads them via `getSetting`.
 */
export const ServerNumberSetting = React.memo(function ServerNumberSetting({
  envVar,
  label,
  description,
  defaultValue,
  min = 1,
  max = 100,
  id
}: ServerNumberSettingProps) {
  const fetchSettings = useRemoteSettingsStore((s) => s.fetchSettings);
  const updateSettings = useRemoteSettingsStore((s) => s.updateSettings);
  // Shared ["settings"] cache: dedupes with the API & Keys tab's own query.
  useQuery({ queryKey: ["settings"], queryFn: fetchSettings });

  const value = useRemoteSettingsStore(
    (s) => s.settings.find((x) => x.env_var === envVar)?.value
  );

  const [local, setLocal] = useState<string>(String(defaultValue));
  useEffect(() => {
    setLocal(value != null && value !== "" ? String(value) : String(defaultValue));
  }, [value, defaultValue]);

  const commit = useCallback(() => {
    const clamped = Math.max(min, Math.min(max, Number(local) || defaultValue));
    setLocal(String(clamped));
    if (String(clamped) !== (value ?? "")) {
      void updateSettings({ [envVar]: String(clamped) });
    }
  }, [local, min, max, defaultValue, value, updateSettings, envVar]);

  return (
    <>
      <TextInput
        type="number"
        autoComplete="off"
        slotProps={{ htmlInput: { min, max } }}
        id={id}
        label={label}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        variant="standard"
        size="small"
      />
      <Text className="description">{description}</Text>
    </>
  );
});

export default ServerNumberSetting;
