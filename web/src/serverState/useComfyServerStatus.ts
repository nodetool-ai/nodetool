/**
 * The saved ComfyUI server's version, GPU and model files. The query runs
 * whenever `COMFY_SERVER_URL` holds an address and refetches when it changes,
 * so saving an address checks it.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import useRemoteSettingsStore from "../stores/RemoteSettingStore";
import {
  COMFY_SERVER_STATUS_KEY,
  fetchComfyServerStatus,
  type ComfyServerStatus
} from "../lib/comfy/comfyServerStatus";

export const useComfyServerUrl = (): string =>
  useRemoteSettingsStore((s) => s.getSettingValue("COMFY_SERVER_URL") ?? "").trim();

export const useComfyServerStatus = (): UseQueryResult<ComfyServerStatus, Error> & {
  serverUrl: string;
} => {
  const serverUrl = useComfyServerUrl();
  const query = useQuery<ComfyServerStatus, Error>({
    queryKey: [COMFY_SERVER_STATUS_KEY, serverUrl],
    queryFn: ({ signal }) => fetchComfyServerStatus(signal),
    enabled: serverUrl.length > 0,
    retry: false,
    staleTime: 30_000
  });
  return { ...query, serverUrl };
};
