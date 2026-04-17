import { trpc } from "../lib/trpc";

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
  return trpc.models.huggingfaceCheckCache.mutate(req);
};

