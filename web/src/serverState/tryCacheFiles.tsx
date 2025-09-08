import { client } from "../stores/ApiClient";
import { RepoPath } from "../stores/ApiTypes";

export const tryCacheFiles = async (files: RepoPath[]) => {
  const { data, error } = await client.POST(
    "/api/models/huggingface/try_cache_files",
    {
      body: files
    }
  );
  if (error) {
    throw new Error("Failed to check if file is cached: " + error);
  }
  return data;
};

export const tryCacheRepos = async (repos: string[]) => {
  const { data, error } = await client.POST(
    "/api/models/huggingface/try_cache_repos",
    {
      body: repos
    }
  );
  if (error) {
    throw new Error("Failed to check if repo is cached: " + error);
  }
  return data;
};
