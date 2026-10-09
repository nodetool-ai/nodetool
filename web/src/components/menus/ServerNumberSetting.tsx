import React, { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TextInput, Text } from "../ui_primitives";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { formatRangeHint } from "./NumberSetting";

interface ServerNumberSettingProps {
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
  const addNotification = useNotificationStore((s) => s.addNotification);
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
      updateSettings({ [envVar]: String(clamped) }).catch((error: unknown) => {
        setLocal(
          value != null && value !== "" ? String(value) : String(defaultValue)
        );
        addNotification({
          type: "error",
          alert: true,
          content: `Could not save ${label}: ${
            error instanceof Error ? error.message : String(error)
          }`
        });
      });
    }
  }, [
    local,
    min,
    max,
    defaultValue,
    value,
    updateSettings,
    envVar,
    addNotification,
    label
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter") {
        commit();
      }
    },
    [commit]
  );

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
        onKeyDown={handleKeyDown}
        variant="standard"
        size="small"
      />
      <Text className="description">
        {description} {formatRangeHint(min, max, defaultValue)}
      </Text>
    </>
  );
});

export default ServerNumberSetting;
