import { trpc } from "../lib/trpc";

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

  return trpc.models.huggingfaceCacheStatus.mutate(items);
};
