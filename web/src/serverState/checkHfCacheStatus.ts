import { BASE_URL } from "../stores/BASE_URL";

export interface HfCacheStatusRequestItem {
  key: string;
  repo_id: string;
  model_type?: string | null;
  path?: string | null;
  allow_patterns?: string | string[] | null;
  ignore_patterns?: string | string[] | null;
}

export interface HfCacheStatusResponseItem {
  key: string;
  downloaded: boolean;
}

export const checkHfCacheStatus = async (
  items: HfCacheStatusRequestItem[]
): Promise<HfCacheStatusResponseItem[]> => {
  if (!items.length) {
    return [];
  }

  const res = await fetch(`${BASE_URL}/api/models/huggingface/cache_status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(items)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `HF cache status failed (${res.status}): ${text || res.statusText}`
    );
  }

  return (await res.json()) as HfCacheStatusResponseItem[];
};
