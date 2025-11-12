import { BASE_URL } from "../stores/BASE_URL";

export interface HfCacheCheckRequest {
  repo_id: string;
  allow_pattern?: string | string[] | null;
  ignore_pattern?: string | string[] | null;
}

export interface HfCacheCheckResponse {
  repo_id: string;
  all_present: boolean;
  total_files: number;
  missing: string[];
}

export const checkHfCache = async (
  req: HfCacheCheckRequest
): Promise<HfCacheCheckResponse> => {
  const res = await fetch(`${BASE_URL}/api/models/huggingface/check_cache`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `HF cache check failed (${res.status}): ${text || res.statusText}`
    );
  }
  return (await res.json()) as HfCacheCheckResponse;
};

